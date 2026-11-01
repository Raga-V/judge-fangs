"""Digging: fetch public sources on the server, safely.

Only https:// URLs on an allowlist of hosts are fetched. Every hostname is
resolved and private, loopback, link-local and reserved addresses are refused.
Redirects are followed by hand, and only to allowlisted hosts."""
from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from typing import Awaitable, Callable
from urllib.parse import quote, urljoin, urlsplit

import httpx

from . import tracing
from .config import Settings

ALLOWED_HOSTS = {"dev.to", "github.com", "api.github.com", "raw.githubusercontent.com", "serpapi.com"}
MAX_BYTES = 3 * 1024 * 1024
MAX_REDIRECTS = 3
UA = "JudgeFangs/1.0 (+https://github.com; hackathon review bot)"
DEV_RESERVED = {"challenges", "t", "search", "settings", "tags", "top", "latest", "api", "p", "about", "enter",
                "new", "dashboard", "readinglist", "notifications", "videos", "podcasts", "listings", "pod", "events"}

Resolver = Callable[[str], Awaitable[list[str]]]


class FetchError(Exception):
    """Safe to show to the user."""


async def default_resolver(host: str) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    return [i[4][0] for i in infos]


def _is_public(ip: str) -> bool:
    addr = ipaddress.ip_address(ip.split("%")[0])
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved
                or addr.is_multicast or addr.is_unspecified)


async def check_url(url: str, resolver: Resolver = default_resolver) -> str:
    """Return the normalised URL, or raise FetchError."""
    try:
        parts = urlsplit(url.strip())
    except ValueError as e:
        raise FetchError("That link is not a valid URL.") from e
    if parts.scheme != "https":
        raise FetchError("Only https:// links can be fetched.")
    host = (parts.hostname or "").lower().rstrip(".")
    if parts.username or parts.password:
        raise FetchError("Links with credentials are not allowed.")
    if parts.port not in (None, 443):
        raise FetchError("Only the standard https port is allowed.")
    if host == "www.dev.to":
        host = "dev.to"
    if host not in ALLOWED_HOSTS:
        raise FetchError(f"The Count only reads dev.to and GitHub links (not {host or 'that'}).")
    try:
        ips = await resolver(host)
    except OSError as e:
        raise FetchError(f"Could not resolve {host}.") from e
    if not ips or not all(_is_public(ip) for ip in ips):
        raise FetchError(f"{host} resolved to a private address; refusing to fetch it.")
    return parts._replace(netloc=host).geturl()


class Fetcher:
    def __init__(self, settings: Settings, client: httpx.AsyncClient, resolver: Resolver = default_resolver):
        self.settings = settings
        self.client = client
        self.resolver = resolver

    async def get(self, url: str, headers: dict | None = None, max_bytes: int = MAX_BYTES) -> httpx.Response:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            current = await check_url(current, self.resolver)
            h = {"user-agent": UA}
            h.update(headers or {})
            if self.settings.github_token and urlsplit(current).hostname == "api.github.com":
                h["authorization"] = f"Bearer {self.settings.github_token}"
            req = self.client.build_request("GET", current, headers=h, timeout=20.0)
            r = await self.client.send(req, follow_redirects=False, stream=True)
            try:
                if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                    current = urljoin(current, r.headers["location"])
                    continue
                body = b""
                async for chunk in r.aiter_bytes():
                    body += chunk
                    if len(body) > max_bytes:
                        raise FetchError("That page is too large to read.")
                # body is already decoded, so drop the encoding headers
                headers = {k: v for k, v in r.headers.items() if k.lower() not in ("content-encoding", "content-length", "transfer-encoding")}
                return httpx.Response(r.status_code, headers=headers, content=body, request=req)
            finally:
                await r.aclose()
        raise FetchError("Too many redirects.")

    async def get_json(self, url: str, headers: dict | None = None):
        r = await self.get(url, {"accept": "application/json", **(headers or {})})
        if r.status_code == 404:
            raise FetchError(f"Not found: {url}")
        if r.status_code == 403 and "api.github.com" in url:
            raise FetchError("GitHub's rate limit was hit. Set GITHUB_TOKEN on the server to lift it.")
        if r.status_code >= 400:
            raise FetchError(f"{urlsplit(url).hostname} answered HTTP {r.status_code}.")
        try:
            return r.json()
        except ValueError as e:
            raise FetchError(f"{urlsplit(url).hostname} sent something that wasn't JSON.") from e

    # ---------------- DEV ----------------

    async def dev_article(self, user: str, slug: str) -> dict:
        with tracing.span("http.client", "fetch dev article", **{"judge.source": "dev"}) as s:
            data = await self.get_json(f"https://dev.to/api/articles/{quote(user)}/{quote(slug)}")
            body = data.get("body_markdown") or ""
            s.set_data("judge.chars", len(body))
        tags = data.get("tags") if isinstance(data.get("tags"), list) else data.get("tag_list") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        return {
            "kind": "dev",
            "url": data.get("url") or f"https://dev.to/{user}/{slug}",
            "title": data.get("title") or "",
            "body": body,
            "tags": tags,
            "published_at": data.get("published_at"),
            "reactions": data.get("public_reactions_count"),
            "author": (data.get("user") or {}).get("name"),
        }

    async def page_text(self, url: str) -> dict:
        from bs4 import BeautifulSoup

        with tracing.span("http.client", "fetch page", **{"judge.source": "page"}) as s:
            r = await self.get(url, {"accept": "text/html"})
            if r.status_code >= 400:
                raise FetchError(f"{urlsplit(url).hostname} answered HTTP {r.status_code}.")
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "form"]):
                tag.decompose()
            title = (soup.title.string or "").strip() if soup.title else ""
            main = soup.find("main") or soup.body or soup
            text = re.sub(r"\n{3,}", "\n\n", main.get_text("\n", strip=True))
            links = [a["href"] for a in main.find_all("a", href=True)]
            s.set_data("judge.chars", len(text))
        return {"kind": "page", "url": url, "title": title, "body": text, "links": links}

    async def dev_any(self, url: str) -> dict:
        """A DEV article via the API, or any other dev.to page as text."""
        parsed = parse_dev_url(url)
        if parsed:
            return await self.dev_article(*parsed)
        return await self.page_text(url)

    # ---------------- GitHub ----------------

    async def raw(self, owner: str, repo: str, branch: str, path: str, max_bytes: int = 200_000) -> str:
        r = await self.get(f"https://raw.githubusercontent.com/{owner}/{repo}/{quote(branch)}/{quote(path)}", max_bytes=max_bytes)
        return r.text if r.status_code == 200 else ""

    async def github_repo(self, owner: str, repo: str) -> dict:
        api = f"https://api.github.com/repos/{owner}/{repo}"
        with tracing.span("http.client", "fetch github repo", **{"judge.source": "github"}) as s:
            meta = await self.get_json(api)
            branch = meta.get("default_branch") or "main"
            tree_task = self.get_json(f"{api}/git/trees/{quote(branch)}?recursive=1")
            langs_task = self.get_json(f"{api}/languages")
            readme_task = self.get(f"{api}/readme", {"accept": "application/vnd.github.raw"}, max_bytes=400_000)
            commits_task = self.get(f"{api}/commits?per_page=1&sha={quote(branch)}", {"accept": "application/json"})
            tree, langs, readme_r, commits_r = await asyncio.gather(tree_task, langs_task, readme_task, commits_task, return_exceptions=True)

            entries = [] if isinstance(tree, Exception) else [t for t in tree.get("tree", []) if t.get("type") == "blob"]
            paths = [t["path"] for t in entries]
            readme = readme_r.text if not isinstance(readme_r, Exception) and readme_r.status_code == 200 else ""
            commit_count = _commit_count(commits_r)
            manifests = [p for p in paths if p.count("/") <= 2 and p.rsplit("/", 1)[-1] in MANIFEST_NAMES]
            sources = pick_source_files(entries)
            wanted = list(dict.fromkeys(manifests[:6] + sources))
            sem = asyncio.Semaphore(6)

            async def grab(p: str) -> tuple[str, str]:
                async with sem:
                    try:
                        return p, await self.raw(owner, repo, branch, p)
                    except (FetchError, httpx.HTTPError):
                        return p, ""

            files = dict(await asyncio.gather(*(grab(p) for p in wanted)))
            s.set_data("judge.files", len(files))
        top2 = sorted({"/".join(p.split("/")[:2]) + ("/" if p.count("/") >= 2 else "") for p in paths})
        return {
            "kind": "github",
            "url": f"https://github.com/{owner}/{repo}",
            "owner": owner,
            "repo": repo,
            "description": meta.get("description") or "",
            "stars": meta.get("stargazers_count"),
            "branch": branch,
            "readme": readme,
            "tree": top2[:200],
            "paths": paths,
            "languages": {} if isinstance(langs, Exception) else langs,
            "commit_count": commit_count,
            "has_ci": any(p.startswith(".github/workflows/") and p.endswith((".yml", ".yaml")) for p in paths),
            "manifests": {p: files.get(p, "") for p in manifests[:6]},
            "files": files,
        }

    # ---------------- search ----------------

    async def serp_first_dev(self, query: str) -> str | None:
        if not self.settings.serpapi_key:
            return None
        with tracing.span("http.client", "serpapi search", **{"judge.source": "search"}):
            url = "https://serpapi.com/search.json?engine=google&num=10&q=" + quote(query) + "&api_key=" + quote(self.settings.serpapi_key)
            data = await self.get_json(url)
        for res in data.get("organic_results") or []:
            link = res.get("link") or ""
            if parse_dev_url(link):
                return link
        return None


MANIFEST_NAMES = {"package.json", "requirements.txt", "pyproject.toml", "Pipfile", "go.mod", "Cargo.toml", "Gemfile", "composer.json", "build.gradle", "pom.xml"}
SOURCE_EXT = (".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".rb", ".rs", ".java", ".kt", ".swift", ".php", ".vue", ".svelte", ".yaml", ".yml", ".toml")
SKIP_DIRS = ("node_modules/", "dist/", "build/", "vendor/", ".next/", "coverage/", "__pycache__/", "public/assets/", ".venv/")
PREFERRED = re.compile(r"(main|index|app|server|config|api|client|instrument|sentry|setup|settings|routes?|llm|ai|voice)\.", re.I)


def pick_source_files(entries: list[dict], limit: int = 24) -> list[str]:
    """Choose a small, telling set of files to scan: env examples, configs, entry points."""
    out = []
    for t in entries:
        p = t["path"]
        name = p.rsplit("/", 1)[-1]
        if any(p.startswith(d) or f"/{d}" in p for d in SKIP_DIRS) or name.endswith((".min.js", ".lock")) or name in {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}:
            continue
        if (t.get("size") or 0) > 80_000:
            continue
        special = name in {".env.example", ".env.sample", "Dockerfile", "render.yaml", "vercel.json", "netlify.toml", "docker-compose.yml", "wrangler.toml"}
        if not (special or name.endswith(SOURCE_EXT)):
            continue
        depth = p.count("/")
        score = (0 if special else 1, 0 if PREFERRED.search(name) else 1, depth, len(p))
        out.append((score, p))
    out.sort()
    return [p for _, p in out[:limit]]


def _commit_count(r) -> int | None:
    if isinstance(r, Exception) or r.status_code != 200:
        return None
    m = re.search(r'[?&]page=(\d+)>; rel="last"', r.headers.get("link", ""))
    if m:
        return int(m.group(1))
    try:
        return len(r.json())
    except ValueError:
        return None


def parse_dev_url(url: str) -> tuple[str, str] | None:
    """https://dev.to/user/slug -> (user, slug). Challenge and tag pages return None."""
    m = re.match(r"^https?://(?:www\.)?dev\.to/([\w.-]+)/([\w-]+)/?(?:[?#].*)?$", (url or "").strip())
    if not m or m.group(1).lower() in DEV_RESERVED:
        return None
    return m.group(1), m.group(2)


def parse_github_url(url: str) -> tuple[str, str] | None:
    m = re.match(r"^https?://(?:www\.)?github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?(?:/.*)?$", (url or "").strip())
    if not m or m.group(1).lower() in {"orgs", "topics", "features", "marketplace", "sponsors", "settings"}:
        return None
    return m.group(1), m.group(2)


def find_github_repo(text: str) -> str | None:
    for m in re.finditer(r"https?://(?:www\.)?github\.com/[\w.-]+/[\w.-]+", text or ""):
        parsed = parse_github_url(m.group(0).rstrip(".,)"))
        if parsed:
            return f"https://github.com/{parsed[0]}/{parsed[1]}"
    return None


def find_dev_articles(text: str, exclude: set[str] | None = None) -> list[str]:
    """DEV article links in a post (plain links and {% embed %} / {% link %} tags), in order."""
    exclude = {normalize_url(u) for u in (exclude or set())}
    seen: list[str] = []
    for m in re.finditer(r"https?://(?:www\.)?dev\.to/[\w.-]+/[\w-]+", text or ""):
        url = m.group(0)
        parsed = parse_dev_url(url)
        if not parsed:
            continue
        norm = normalize_url(url)
        if norm in exclude or norm in seen:
            continue
        seen.append(norm)
    return seen


def normalize_url(url: str) -> str:
    u = (url or "").strip().split("#")[0].split("?")[0].rstrip("/")
    return re.sub(r"^https?://(www\.)?", "https://", u).lower()


def cap(text: str, n: int) -> str:
    text = text or ""
    return text if len(text) <= n else text[:n] + "\n[... trimmed by the Count ...]"

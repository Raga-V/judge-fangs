import asyncio

import httpx
import pytest

from app.config import load_settings
from app.fetchers import (FetchError, Fetcher, check_url, find_dev_articles, find_github_repo, normalize_url,
                          parse_dev_url, parse_github_url)


async def public(host):
    return ["93.184.216.34"]


def resolver_for(ips):
    async def r(host):
        return ips
    return r


def run(c):
    return asyncio.run(c)


@pytest.mark.parametrize("url,msg", [
    ("http://dev.to/a/b", "https"),
    ("https://evil.example/a", "only reads"),
    ("https://dev.to.evil.example/a", "only reads"),
    ("https://user:pw@dev.to/a", "credentials"),
    ("https://dev.to:8080/a", "port"),
    ("file:///etc/passwd", "https"),
    ("ftp://github.com/x", "https"),
])
def test_allowlist(url, msg):
    with pytest.raises(FetchError, match=msg):
        run(check_url(url, public))


@pytest.mark.parametrize("ips", [["127.0.0.1"], ["10.0.0.5"], ["169.254.169.254"], ["192.168.1.2"], ["::1"],
                                 ["::ffff:127.0.0.1"], ["93.184.216.34", "10.0.0.1"], ["0.0.0.0"], []])
def test_private_addresses_are_refused(ips):
    with pytest.raises(FetchError, match="private|resolve"):
        run(check_url("https://dev.to/a/b", resolver_for(ips)))


def test_allowed_hosts_pass():
    for u in ["https://dev.to/a/b", "https://www.dev.to/a/b", "https://api.github.com/repos/a/b",
              "https://raw.githubusercontent.com/a/b/main/x", "https://github.com/a/b", "https://serpapi.com/search.json"]:
        assert run(check_url(u, public)).startswith("https://")


def fetcher(handler):
    async def go(fn):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await fn(Fetcher(load_settings({}), c, public))
    return go


def test_redirect_to_another_host_is_blocked():
    def handler(req):
        return httpx.Response(302, headers={"location": "https://169.254.169.254/latest/meta-data"})
    with pytest.raises(FetchError, match="only reads"):
        run(fetcher(handler)(lambda f: f.get("https://github.com/a/b")))


def test_redirect_within_allowlist_is_followed():
    def handler(req):
        if req.url.host == "github.com":
            return httpx.Response(301, headers={"location": "https://raw.githubusercontent.com/a/b/main/README.md"})
        return httpx.Response(200, text="hello")
    r = run(fetcher(handler)(lambda f: f.get("https://github.com/a/b/raw/main/README.md")))
    assert r.text == "hello"


def test_redirect_loops_stop():
    def handler(req):
        return httpx.Response(302, headers={"location": "https://dev.to/x/y"})
    with pytest.raises(FetchError, match="redirects"):
        run(fetcher(handler)(lambda f: f.get("https://dev.to/a/b")))


def test_size_cap():
    def handler(req):
        return httpx.Response(200, content=b"x" * 5000)
    with pytest.raises(FetchError, match="too large"):
        run(fetcher(handler)(lambda f: f.get("https://dev.to/a/b", max_bytes=1000)))


def test_dev_article_uses_the_public_api():
    seen = []

    def handler(req):
        seen.append(str(req.url))
        return httpx.Response(200, json={"title": "T", "body_markdown": "Body", "tags": ["ai"], "published_at": "2026-10-01",
                                         "public_reactions_count": 7, "url": "https://dev.to/u/s"})
    post = run(fetcher(handler)(lambda f: f.dev_article("u", "s")))
    assert seen == ["https://dev.to/api/articles/u/s"]
    assert post["title"] == "T" and post["reactions"] == 7 and post["tags"] == ["ai"]


def test_url_parsing():
    assert parse_dev_url("https://dev.to/jane/my-post-12ab") == ("jane", "my-post-12ab")
    assert parse_dev_url("https://dev.to/challenges/hacktoberfest") is None
    assert parse_dev_url("https://dev.to/t/ai") is None
    assert parse_github_url("https://github.com/a/b.git") == ("a", "b")
    assert parse_github_url("https://github.com/a/b/tree/main/src") == ("a", "b")
    assert find_github_repo("see https://github.com/x/y). Thanks") == "https://github.com/x/y"
    text = "Winners: https://dev.to/a/one and {% embed https://dev.to/b/two %} and https://dev.to/a/one?x=1 and https://dev.to/t/tag"
    assert find_dev_articles(text) == ["https://dev.to/a/one", "https://dev.to/b/two"]
    assert find_dev_articles(text, exclude={"https://dev.to/A/one/"}) == ["https://dev.to/b/two"]
    assert normalize_url("http://www.dev.to/A/B/?utm=1#x") == "https://dev.to/a/b"

"""Deterministic checks. No AI here: facts about the post, partner claims
against the code, and the exact-quote guard rail."""
from __future__ import annotations

import json
import math
import re
from typing import Any

from . import tracing

# ---------------------------------------------------------------- post facts

NUMBER_WORDS = r"\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|hundred|thousand|million)\b"
DEMO_HOSTS = r"(onrender\.com|vercel\.app|netlify\.app|github\.io|pages\.dev|fly\.dev|herokuapp\.com|hf\.space|huggingface\.co/spaces|railway\.app|surge\.sh|glitch\.me|replit\.(app|dev|co)|streamlit\.app|web\.app|firebaseapp\.com|workers\.dev|deno\.dev|azurewebsites\.net|appspot\.com|chromewebstore\.google\.com|apps\.apple\.com|play\.google\.com)"


def prose(markdown: str) -> str:
    t = re.sub(r"```.*?```", " ", markdown or "", flags=re.S)
    t = re.sub(r"\{%.*?%\}", " ", t)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"[#>*_`|~-]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def post_facts(title: str, body: str) -> dict[str, Any]:
    body = body or ""
    words = len(prose(body).split())
    images = len(re.findall(r"!\[[^\]]*\]\([^)]+\)", body)) + len(re.findall(r"<img\b", body, re.I))
    videos = len(re.findall(r"\{%\s*(youtube|vimeo|loom)\b", body, re.I))
    videos += len(re.findall(r"\{%\s*embed\s+https?://(www\.)?(youtube\.com|youtu\.be|vimeo\.com|loom\.com)", body, re.I))
    videos += len(re.findall(r"<(video|iframe)[^>]+(youtube|vimeo|loom|\.mp4)", body, re.I))
    links = re.findall(r"https?://[^\s)\]>\"'%]+", body)
    demo = any(re.search(DEMO_HOSTS, u, re.I) for u in links) or bool(
        re.search(r"\[[^\]]*\b(live demo|demo|try it|live site|play it)\b[^\]]*\]\(https?://", body, re.I))
    repo = bool(re.search(r"https?://(www\.)?github\.com/[\w.-]+/[\w.-]+", body))
    headings = re.findall(r"^#{1,6}\s+(.+)$", body, re.M)
    open_section = any(re.search(r"\bopen[- ]?(source|innovation|weights?)\b", h, re.I) for h in headings)
    return {
        "word_count": words,
        "reading_time_min": max(1, math.ceil(words / 265)) if words else 0,
        "title_has_number": bool(re.search(r"\d", title or "") or re.search(NUMBER_WORDS, title or "", re.I)),
        "images": images,
        "videos": videos,
        "has_demo_link": demo,
        "has_repo_link": repo,
        "has_open_innovation_section": open_section,
        "headings": len(headings),
        "code_blocks": len(re.findall(r"```", body)) // 2,
    }


# ---------------------------------------------------------------- partner claims

PARTNERS: dict[str, dict[str, list[str]]] = {
    "Sentry": {"names": ["sentry"], "packages": ["@sentry/", "sentry-sdk", "sentry_sdk", "raven"], "env": ["SENTRY_DSN", "SENTRY_AUTH_TOKEN"], "strings": ["ingest.sentry.io", "sentry.init", "Sentry.init"]},
    "ElevenLabs": {"names": ["elevenlabs", "eleven labs"], "packages": ["elevenlabs", "@elevenlabs/", "@11labs/"], "env": ["ELEVENLABS_API_KEY", "ELEVEN_API_KEY", "XI_API_KEY", "ELEVENLABS_"], "strings": ["api.elevenlabs.io"]},
    "Gemini": {"names": ["gemini"], "packages": ["@google/generative-ai", "@google/genai", "google-generativeai", "google-genai", "google.generativeai", "google.genai"], "env": ["GEMINI_API_KEY", "GOOGLE_GENAI", "GOOGLE_API_KEY"], "strings": ["generativelanguage.googleapis.com", "gemini-"]},
    "Gemma": {"names": ["gemma"], "packages": [], "env": [], "strings": ["gemma-", "gemma3", "gemma2", "gemma:"]},
    "Auth0": {"names": ["auth0"], "packages": ["@auth0/", "auth0", "authlib"], "env": ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_SECRET"], "strings": [".auth0.com"]},
    "MongoDB": {"names": ["mongodb", "mongo atlas", "atlas"], "packages": ["mongodb", "mongoose", "pymongo", "motor"], "env": ["MONGODB_URI", "MONGO_URI", "MONGODB_URL"], "strings": ["mongodb+srv://"]},
    "Algolia": {"names": ["algolia"], "packages": ["algoliasearch", "@algolia/", "react-instantsearch"], "env": ["ALGOLIA_"], "strings": []},
    "Twilio": {"names": ["twilio"], "packages": ["twilio", "@twilio/"], "env": ["TWILIO_"], "strings": []},
    "Stripe": {"names": ["stripe"], "packages": ["stripe", "@stripe/"], "env": ["STRIPE_"], "strings": []},
    "Supabase": {"names": ["supabase"], "packages": ["@supabase/", "supabase"], "env": ["SUPABASE_"], "strings": [".supabase.co"]},
    "Neon": {"names": ["neon"], "packages": ["@neondatabase/"], "env": ["NEON_"], "strings": ["neon.tech"]},
    "Redis": {"names": ["redis"], "packages": ["redis", "ioredis", "@upstash/redis", "@redis/"], "env": ["REDIS_URL", "REDIS_"], "strings": ["redis://", "rediss://"]},
    "Cloudflare": {"names": ["cloudflare"], "packages": ["wrangler", "@cloudflare/"], "env": ["CLOUDFLARE_"], "strings": ["workers.dev"]},
    "OpenAI": {"names": ["openai"], "packages": ["openai", "@ai-sdk/openai"], "env": ["OPENAI_API_KEY"], "strings": ["api.openai.com"]},
    "Anthropic": {"names": ["anthropic", "claude"], "packages": ["@anthropic-ai/sdk", "anthropic"], "env": ["ANTHROPIC_API_KEY"], "strings": ["api.anthropic.com"]},
    "Mux": {"names": ["mux"], "packages": ["@mux/", "mux-python"], "env": ["MUX_TOKEN", "MUX_"], "strings": ["stream.mux.com"]},
    "Pinata": {"names": ["pinata"], "packages": ["pinata", "@pinata/", "pinata-web3"], "env": ["PINATA_"], "strings": ["pinata.cloud"]},
    "AssemblyAI": {"names": ["assemblyai", "assembly ai"], "packages": ["assemblyai"], "env": ["ASSEMBLYAI_"], "strings": ["api.assemblyai.com"]},
    "Deepgram": {"names": ["deepgram"], "packages": ["@deepgram/", "deepgram-sdk", "deepgram"], "env": ["DEEPGRAM_"], "strings": ["api.deepgram.com"]},
    "Bright Data": {"names": ["bright data", "brightdata"], "packages": ["brightdata", "@brightdata/"], "env": ["BRIGHTDATA_", "BRIGHT_DATA_"], "strings": ["brd.superproxy.io", "brightdata.com"]},
    "Firebase": {"names": ["firebase"], "packages": ["firebase", "firebase-admin"], "env": ["FIREBASE_"], "strings": []},
    "Clerk": {"names": ["clerk"], "packages": ["@clerk/"], "env": ["CLERK_"], "strings": []},
    "Appwrite": {"names": ["appwrite"], "packages": ["appwrite", "node-appwrite"], "env": ["APPWRITE_"], "strings": []},
    "Storyblok": {"names": ["storyblok"], "packages": ["@storyblok/", "storyblok-js-client"], "env": ["STORYBLOK_"], "strings": []},
    "Permit.io": {"names": ["permit.io", "permit io"], "packages": ["permitio", "permit"], "env": ["PERMIT_"], "strings": []},
    "Pulumi": {"names": ["pulumi"], "packages": ["@pulumi/", "pulumi"], "env": ["PULUMI_"], "strings": []},
    "Groq": {"names": ["groq"], "packages": ["groq-sdk", "groq"], "env": ["GROQ_API_KEY"], "strings": ["api.groq.com"]},
    "Hugging Face": {"names": ["hugging face", "huggingface"], "packages": ["@huggingface/", "huggingface_hub", "huggingface-hub", "transformers"], "env": ["HF_TOKEN", "HUGGINGFACE_"], "strings": ["huggingface.co"]},
    "DigitalOcean": {"names": ["digitalocean", "digital ocean"], "packages": ["digitalocean", "@digitalocean/"], "env": ["DIGITALOCEAN_"], "strings": []},
    "Render": {"names": ["render.com", "onrender.com", "render.yaml", "deployed on render", "deploy to render", "hosted on render", "render blueprint", "render web service"], "packages": [], "env": ["RENDER_"], "strings": ["onrender.com"], "files": ["render.yaml"]},
    "Vercel": {"names": ["vercel"], "packages": ["@vercel/", "vercel"], "env": ["VERCEL_"], "strings": ["vercel.app"], "files": ["vercel.json"]},
    "Netlify": {"names": ["netlify"], "packages": ["@netlify/", "netlify-cli"], "env": ["NETLIFY_"], "strings": ["netlify.app"], "files": ["netlify.toml"]},
    "Google Cloud": {"names": ["google cloud", "gcp", "cloud run"], "packages": ["@google-cloud/", "google-cloud-"], "env": ["GOOGLE_CLOUD_PROJECT", "GCP_"], "strings": [".run.app"]},
    "n8n": {"names": ["n8n"], "packages": ["n8n"], "env": ["N8N_"], "strings": []},
    "LiveKit": {"names": ["livekit"], "packages": ["livekit", "@livekit/", "livekit-server-sdk"], "env": ["LIVEKIT_"], "strings": []},
}

STRIP_WORDS = re.compile(r"\b(best|use|uses|of|the|prize|prizes|category|categories|award|awards|with|using|winner|winners|overall|track|challenge|for|built|build|integration|most|creative|innovative|top)\b", re.I)
GENERIC = {"", "ux", "ui", "beginner", "beginners", "community", "student", "students", "team", "solo", "design", "impact", "fun", "humor", "people's choice", "peoples choice", "honorable mention", "honorable mentions", "runner up", "runners up", "first", "second", "third", "grand"}


def partner_from_category(category: str) -> str | None:
    """'Best Use of Sentry' -> 'Sentry'. Generic categories return None."""
    name = re.sub(r"[()\[\]:\"'!]", " ", category or "")
    for canon, sig in PARTNERS.items():
        if any(re.search(rf"\b{re.escape(n)}\b", name, re.I) for n in sig["names"]):
            return canon
    left = re.sub(r"\s+", " ", STRIP_WORDS.sub(" ", name)).strip(" -,.&")
    if left.lower() in GENERIC or len(left) < 2 or len(left.split()) > 3:
        return None
    return left


def claimed_partners(submission_text: str, prize_categories: list[str]) -> list[dict]:
    """Which partner prizes does the submission go for? Brief categories it names, plus explicit
    'Best Use of X' phrases. A partner only counts if the post also talks about it outside the
    category phrase, so a pasted list of every prize category doesn't claim them all."""
    text = submission_text or ""
    # just the category name: up to three Capitalised words after "best use of"
    phrase = r"\b(?i:best use of) ([A-Z][\w.]*(?: [A-Z][\w.]*){0,2})"
    outside = re.sub(phrase, " ", text)
    candidates: dict[str, str] = {}
    for cat in prize_categories or []:
        partner = partner_from_category(cat)
        if partner:
            candidates.setdefault(partner, cat)
    for m in re.finditer(phrase, text):
        partner = partner_from_category("Best Use of " + m.group(1))
        if partner:
            candidates.setdefault(partner, "Best Use of " + m.group(1).strip())
    claims = []
    for partner, cat in candidates.items():
        names = PARTNERS.get(partner, {}).get("names") or [partner.lower()]
        if any(re.search(rf"\b{re.escape(n)}\b", outside, re.I) for n in names):
            claims.append({"partner": partner, "claim": cat})
    return claims


def dependency_names(manifests: dict[str, str]) -> list[tuple[str, str]]:
    """(dependency, manifest path) pairs from package.json, requirements.txt, pyproject and friends."""
    out: list[tuple[str, str]] = []
    for path, text in (manifests or {}).items():
        name = path.rsplit("/", 1)[-1]
        if name == "package.json":
            try:
                pkg = json.loads(text or "{}")
            except ValueError:
                continue
            for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
                out += [(d, path) for d in (pkg.get(key) or {})]
        elif name == "requirements.txt":
            for line in (text or "").splitlines():
                m = re.match(r"^\s*([A-Za-z0-9_.\-\[\]]+)", line)
                if m and not line.strip().startswith(("#", "-")):
                    out.append((m.group(1).split("[")[0].lower(), path))
        else:
            for m in re.finditer(r"[\"']([A-Za-z0-9_.@/\-]+)(?:[<>=~^! ].*?)?[\"']", text or ""):
                out.append((m.group(1).lower(), path))
            for m in re.finditer(r"^\s*([A-Za-z0-9_.\-]+)\s*=", text or "", re.M):
                out.append((m.group(1).lower(), path))
    return out


def scan_partner(partner: str, repo: dict | None, post_text: str = "") -> dict:
    """backed (code evidence) / mentioned (only in prose) / not_found / no_repo."""
    sig = PARTNERS.get(partner) or {"names": [partner.lower()], "packages": [partner.lower().replace(" ", "-")],
                                    "env": [re.sub(r"\W+", "_", partner.upper()) + "_"], "strings": []}
    names = sig["names"]
    if not repo:
        mentioned = any(re.search(rf"\b{re.escape(n)}\b", post_text or "", re.I) for n in names)
        return {"partner": partner, "status": "no_repo", "evidence": [], "mentioned_in_post": mentioned}
    evidence: list[str] = []
    def dep_matches(dep: str, p: str) -> bool:
        p = p.lower()
        if p.endswith(("/", "_")):
            return dep.startswith(p)
        return dep == p or dep.startswith((p + "-", p + "_", p + "/"))

    for dep, path in dependency_names(repo.get("manifests") or {}):
        if any(dep_matches(dep, p) for p in sig["packages"]):
            evidence.append(f"dependency {dep} in {path}")
    for path, text in (repo.get("files") or {}).items():
        if not text:
            continue
        for p in sig["packages"]:
            pat = re.escape(p.rstrip("/"))
            m = re.search(rf"""(?:from\s+|require\(\s*|import\s+)['"]({pat}[^'"]*)['"]|^\s*(?:from|import)\s+({pat}[\w.]*)""", text, re.M | re.I)
            if m:
                evidence.append(f"import of {m.group(1) or m.group(2)} in {path}")
                break
        for env in sig["env"]:
            m = re.search(rf"\b{re.escape(env)}[A-Z0-9_]*", text)
            if m:
                evidence.append(f"env var {m.group(0)} in {path}")
                break
        for s in sig["strings"]:
            if s.lower() in text.lower():
                evidence.append(f"'{s}' in {path}")
                break
    for f in sig.get("files", []):
        if any(p.rsplit("/", 1)[-1] == f for p in repo.get("paths") or []):
            evidence.append(f"file {f}")
    evidence = list(dict.fromkeys(evidence))[:6]
    if evidence:
        status = "backed"
    else:
        # the post always names what it claims, so only the repo's own prose counts as a mention
        prose_text = repo.get("readme") or ""
        status = "mentioned" if any(re.search(rf"\b{re.escape(n)}\b", prose_text, re.I) for n in names) else "not_found"
    return {"partner": partner, "status": status, "evidence": evidence}


def run_checks(submission: dict, repo: dict | None, prize_categories: list[str]) -> dict:
    with tracing.span("judge.checks", "code checks") as s:
        text = (submission.get("title") or "") + "\n" + (submission.get("body") or "")
        facts = post_facts(submission.get("title") or "", submission.get("body") or "")
        claims = claimed_partners(text, prize_categories)
        partners = [dict(scan_partner(c["partner"], repo, text), claim=c["claim"]) for c in claims]
        if repo:
            facts.update({
                "repo_commits": repo.get("commit_count"),
                "repo_has_ci": repo.get("has_ci"),
                "repo_languages": list((repo.get("languages") or {}).keys())[:5],
                "repo_has_readme": bool(repo.get("readme")),
                "repo_files_scanned": len([t for t in (repo.get("files") or {}).values() if t]),
            })
        s.set_data("judge.claims", len(partners))
        s.set_data("judge.backed", sum(1 for p in partners if p["status"] == "backed"))
    return {"facts": facts, "partners": partners}


# ---------------------------------------------------------------- the quote check

_TRANS = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", " ": " "})


def _norm(s: str) -> str:
    s = (s or "").translate(_TRANS).lower()
    s = re.sub(r"\]\([^)]*\)", "", s)  # [text](url) -> [text
    s = re.sub(r"[*_`#>\[\]]", "", s)
    return re.sub(r"\s+", " ", s).strip(" \"'")


def quote_in_text(quote: str, text: str) -> bool:
    """True only if the quote really appears in the text (ignoring case, markdown and whitespace).
    An ellipsis may join two exact pieces that appear in order."""
    q = _norm(quote)
    if len(q) < 6:
        return False
    hay = _norm(text)
    parts = [p.strip(" .") for p in re.split(r"\.\.\.|…", q) if p.strip(" .")]
    if len(parts) <= 1:
        return q in hay
    pos = 0
    for p in parts:
        if len(p) < 6:
            return False
        i = hay.find(p, pos)
        if i == -1:
            return False
        pos = i + len(p)
    return True

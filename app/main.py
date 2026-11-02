"""Judge Fangs API. Holds every secret, makes every model call.
Run: uvicorn app.main:app --reload"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Literal

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from . import tracing
from .backtest import score_backtest
from .companion import chat, debrief, dig_case, ideas
from .config import Settings, load_settings
from .fetchers import FetchError, Fetcher, Resolver, default_resolver
from .judge import Context, identify_screen, log, run_review, screen_request
from .limits import ADJOURNED, BodyCapMiddleware, DailyCap, RateLimiter, client_ip
from .llm import LLMFailed
from .voice import AudioCache, VoiceRegistry, synthesize, text_hash

DEMO_DIR = Path(__file__).parent / "demo"
DEMO_BANNER = "Demo mode: the Count recites a past judgement. The live tribunal needs LLM_API_KEY on the server."
ADJOURNED_BANNER = f"{ADJOURNED} Here is a past judgement instead."
SCREEN_LIMIT = 1024 * 1024


def load_demos() -> dict[str, dict]:
    """The two example verdicts (strong.json, weak.json)."""
    out = {}
    for name in ("strong.json", "weak.json"):
        v = json.loads((DEMO_DIR / name).read_text(encoding="utf-8"))
        out[v["id"]] = v
    return out


def load_demo_case() -> dict:
    """A fully populated example case (Hacktoberfest Week 3), also bundled into the web app."""
    return json.loads((DEMO_DIR / "case.json").read_text(encoding="utf-8"))


def _blank(v: Any) -> Any:
    return v.strip() or None if isinstance(v, str) else v


class ReviewIn(BaseModel):
    mode: Literal["hackathon", "email", "idea", "pitch"] = "hackathon"
    hackathon_url: str | None = Field(None, max_length=500)
    hackathon_text: str | None = Field(None, max_length=30000)
    submission_url: str | None = Field(None, max_length=500)
    repo_url: str | None = Field(None, max_length=500)
    submission_text: str | None = Field(None, max_length=40000)
    context: str | None = Field(None, max_length=2000)
    winners_url: str | None = Field(None, max_length=500)
    exclude_urls: list[str] = Field(default_factory=list, max_length=25)
    brief: dict | None = None  # the case file's brief, so the Count needn't dig again
    patterns: list[str] = Field(default_factory=list, max_length=8)
    user_context: str | None = Field(None, max_length=2000)  # chosen idea + lessons learned

    @field_validator("hackathon_url", "hackathon_text", "submission_url", "repo_url", "submission_text", "context",
                     "winners_url", "user_context", mode="before")
    @classmethod
    def blank_is_none(cls, v: Any) -> Any:
        return _blank(v)


class CaseIn(BaseModel):
    url: str | None = Field(None, max_length=500)
    name: str | None = Field(None, max_length=160)
    text: str | None = Field(None, max_length=30000)
    winners_url: str | None = Field(None, max_length=500)

    @field_validator("url", "name", "text", "winners_url", mode="before")
    @classmethod
    def blank_is_none(cls, v: Any) -> Any:
        return _blank(v)


class ChatMessage(BaseModel):
    role: Literal["user", "fangs"]
    content: str = Field(..., max_length=4000)


class ChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    context: str = Field("", max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
    tab: str = Field("brief", max_length=20)


class IdeasIn(BaseModel):
    mode: Literal["judge", "generate"]
    brief: dict | None = None
    ideas: list[str] = Field(default_factory=list, max_length=5)
    patterns: list[str] = Field(default_factory=list, max_length=8)
    user_context: str | None = Field(None, max_length=2000)


class DebriefIn(BaseModel):
    brief: dict | None = None
    submission: dict = Field(default_factory=dict)
    winners_url: str | None = Field(None, max_length=500)
    winners_text: str | None = Field(None, max_length=20000)
    result: Literal["won", "lost"] = "lost"

    @field_validator("winners_url", "winners_text", mode="before")
    @classmethod
    def blank_is_none(cls, v: Any) -> Any:
        return _blank(v)


class VoiceIn(BaseModel):
    text: str = Field(..., max_length=1000)


class ScreenIn(BaseModel):
    image: str = Field(..., max_length=SCREEN_LIMIT)


class BacktestScoreIn(BaseModel):
    results: list[dict] = Field(..., max_length=50)
    winners: list[str] = Field(default_factory=list, max_length=50)
    top_n: int = 5


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def create_app(settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None,
               resolver: Resolver | None = None, now=time.time) -> FastAPI:
    settings = settings or load_settings()
    demos = load_demos()
    demo_case = load_demo_case()
    registry = VoiceRegistry(now=now)
    for d in list(demos.values()) + demo_case.get("verdicts", []):
        registry.add_permanent(d["voice_line"])
    state: dict[str, Any] = {}

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        client = httpx.AsyncClient(transport=transport, headers={"user-agent": "JudgeFangs/1.0"})
        state["client"] = client
        state["ctx"] = Context(settings, client, Fetcher(settings, client, resolver or default_resolver))
        yield
        await client.aclose()

    app = FastAPI(title="Judge Fangs", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_origin_regex=settings.web_origin_regex or None,
                       allow_methods=["GET", "POST"], allow_headers=["content-type"], max_age=600)
    app.add_middleware(BodyCapMiddleware, default=64 * 1024, overrides={"/api/judge-screen": SCREEN_LIMIT})
    limiter = RateLimiter({"review": settings.rate_reviews, "backtest": settings.rate_backtest, "voice": settings.rate_voice,
                           "case": settings.rate_cases, "chat": settings.rate_chat, "ideas": settings.rate_ideas,
                           "debrief": settings.rate_debrief}, now=now)
    caps = DailyCap({"review": settings.daily_review_cap, "voice": settings.daily_voice_cap, "chat": settings.daily_chat_cap}, now=now)
    cache = AudioCache(str(Path(settings.cache_dir) / "voice") if settings.cache_dir else None)
    verdicts: dict[str, tuple[float, dict]] = {}

    def remember(v: dict) -> dict:
        registry.add(v["voice_line"])
        verdicts[v["id"]] = (now() + 3600, v)
        if len(verdicts) > 500:
            t = now()
            for k in [k for k, (exp, _) in verdicts.items() if exp < t]:
                verdicts.pop(k, None)
        return v

    def pick_demo(req: ReviewIn) -> dict:
        key = (req.submission_url or req.submission_text or req.hackathon_url or "").encode()
        ids = sorted(demos)
        return demos[ids[int(hashlib.sha256(key).hexdigest(), 16) % len(ids)]]

    def gate(request: Request, bucket: str, cap: str = "review") -> str | None:
        """None if the live tribunal may sit; otherwise a banner explaining the demo answer."""
        if settings.demo_mode:
            return DEMO_BANNER
        ok, _ = limiter.take(bucket, client_ip(request, settings.trust_proxy))
        if not ok or caps.reached(cap):
            return ADJOURNED_BANNER
        caps.add(cap)
        return None

    def demo_verdict(req: ReviewIn, banner: str) -> dict:
        return {**pick_demo(req), "banner": banner}

    async def collect(req: dict) -> tuple[list[str], dict | None, str | None]:
        logs, verdict, error = [], None, None
        async for ev in run_review(state["ctx"], req):
            if ev["type"] == "log":
                logs.append(ev["msg"])
            elif ev["type"] == "verdict":
                verdict = remember(ev["verdict"])
            elif ev["type"] == "error":
                error = ev["msg"]
        return logs, verdict, error

    # ------------------------------------------------------------ routes

    @app.get("/healthz", response_class=PlainTextResponse)
    async def healthz() -> str:
        return "ok"

    @app.get("/api/config")
    async def config() -> dict:
        return {"demo": settings.demo_mode, "voice": bool(settings.eleven_key), "search": bool(settings.serpapi_key),
                "model": None if settings.demo_mode else settings.llm_model, "banner": DEMO_BANNER if settings.demo_mode else None}

    @app.get("/api/demo")
    async def demo_list() -> list[dict]:
        return [{"id": d["id"], "label": d["example_label"], "overall": d["overall"]} for d in demos.values()]

    @app.get("/api/demo/{demo_id}")
    async def demo_get(demo_id: str):
        d = demos.get(demo_id)
        return JSONResponse(d) if d else JSONResponse({"error": "No such judgement."}, status_code=404)

    @app.get("/api/verdict/{vid}")
    async def verdict_get(vid: str):
        if vid in demos:
            return demos[vid]
        hit = verdicts.get(vid)
        if not hit or hit[0] < now():
            return JSONResponse({"error": "That verdict has crumbled to dust (they last one hour)."}, status_code=404)
        return hit[1]

    @app.post("/api/review")
    async def review(req: ReviewIn, request: Request):
        banner = gate(request, "review")
        if banner:
            return {"logs": [], "verdict": demo_verdict(req, banner)}
        logs, verdict, error = await collect(req.model_dump())
        if error:
            return JSONResponse({"logs": logs, "error": error}, status_code=422)
        return {"logs": logs, "verdict": verdict}

    @app.post("/api/review/stream")
    async def review_stream(req: ReviewIn, request: Request):
        banner = gate(request, "review")

        async def events() -> AsyncIterator[str]:
            if banner:
                for msg in ["The Count stirs in his crypt…", "No live tribunal tonight. He recites a past judgement."]:
                    yield sse("log", log(msg))
                yield sse("verdict", demo_verdict(req, banner))
                return
            async for ev in run_review(state["ctx"], req.model_dump()):
                if ev["type"] == "verdict":
                    yield sse("verdict", remember(ev["verdict"]))
                else:
                    yield sse(ev["type"], ev)

        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"cache-control": "no-cache", "x-accel-buffering": "no"})

    @app.post("/api/backtest/review")
    async def backtest_review(req: ReviewIn, request: Request):
        """One blind entry of a backtest. exclude_urls must list every post being judged."""
        if req.mode != "hackathon" or not req.submission_url:
            return JSONResponse({"error": "A backtest entry needs a DEV post URL."}, status_code=400)
        if req.submission_url not in req.exclude_urls:
            req.exclude_urls.append(req.submission_url)
        banner = gate(request, "backtest")
        if banner:
            return JSONResponse({"error": banner}, status_code=429 if banner == ADJOURNED_BANNER else 503)
        logs, verdict, error = await collect(req.model_dump())
        if error:
            return JSONResponse({"logs": logs, "error": error}, status_code=422)
        return {"logs": logs, "verdict": verdict}

    @app.post("/api/backtest/score")
    async def backtest_score(body: BacktestScoreIn) -> dict:
        return score_backtest(body.results, body.winners, body.top_n)

    @app.post("/api/voice")
    async def voice(body: VoiceIn, request: Request):
        text = body.text.strip()
        if not registry.allowed(text):
            return JSONResponse({"error": "The Count only reads his own verdicts aloud."}, status_code=403)
        key = text_hash(text)
        hit = cache.get(key)
        if hit:
            return Response(hit, media_type="audio/mpeg", headers={"x-cache": "hit", "cache-control": "private, max-age=86400"})
        if not settings.eleven_key:
            return JSONResponse({"error": "The Count's voice is resting (no ELEVENLABS_API_KEY).", "fallback": "browser"}, status_code=503)
        ok, _ = limiter.take("voice", client_ip(request, settings.trust_proxy))
        if not ok or caps.reached("voice"):
            return JSONResponse({"error": ADJOURNED, "fallback": "browser"}, status_code=429)
        caps.add("voice")
        try:
            audio = await synthesize(settings, state["client"], text)
        except httpx.HTTPError:
            return JSONResponse({"error": "The Count has lost his voice. Try again later.", "fallback": "browser"}, status_code=502)
        cache.set(key, audio)
        return Response(audio, media_type="audio/mpeg", headers={"cache-control": "private, max-age=86400"})

    @app.post("/api/judge-screen")
    async def judge_screen(body: ScreenIn, request: Request):
        m = re.match(r"^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$", body.image)
        if not m:
            return JSONResponse({"error": "Send a base64 JPEG data URL."}, status_code=400)
        size = len(base64.b64decode(m.group(2), validate=False))
        if size > 800 * 1024:
            return JSONResponse({"error": "The screenshot is too large (max 600 KB)."}, status_code=413)
        banner = gate(request, "review")
        if banner:
            return {"seen": None, "logs": [], "verdict": demo_verdict(ReviewIn(), banner)}
        ctx = state["ctx"]
        with tracing.span("gen_ai.invoke_agent", "invoke_agent judge_fangs screen", **{"judge.mode": "screen", "judge.image_bytes": size}):
            image = body.image
            try:
                seen = await identify_screen(ctx, image)
            except LLMFailed as e:
                return JSONResponse({"error": str(e)}, status_code=422)
            finally:
                # the screenshot is never stored: drop every reference right after the model call
                del image
                body.image = ""
        req = ReviewIn(**{k: v for k, v in screen_request(seen).items() if v})
        logs, verdict, error = await collect(req.model_dump())
        if error:
            return JSONResponse({"seen": {"kind": seen["kind"], "title": seen["title"]}, "logs": logs, "error": error}, status_code=422)
        return {"seen": {"kind": seen["kind"], "title": seen["title"], "challenge": seen.get("challenge_name")}, "logs": logs, "verdict": verdict}

    # ------------------------------------------------------------ the companion

    @app.get("/api/demo-case")
    async def get_demo_case() -> dict:
        return demo_case

    @app.post("/api/case/stream")
    async def case_stream(body: CaseIn, request: Request):
        """Open a case: dig the brief (searching by name if there's no URL) and the winners' patterns."""
        if not (body.url or body.name or body.text):
            return JSONResponse({"error": "Give the Count a hackathon URL or a name, mortal."}, status_code=400)
        banner = gate(request, "case")

        async def events() -> AsyncIterator[str]:
            if banner:
                yield sse("log", log("The Count opens a case file from memory…"))
                yield sse("case", {**{k: demo_case[k] for k in ("brief", "patterns", "winner_stats", "winners", "sources", "winners_url")},
                                   "banner": banner})
                return
            ctx = state["ctx"]
            with tracing.span("gen_ai.invoke_agent", "invoke_agent open_case", **{"judge.mode": "case", "judge.has_url": bool(body.url),
                                                                                 "judge.has_name": bool(body.name)}):
                try:
                    async for ev in dig_case(ctx, body.model_dump()):
                        yield sse(ev["type"], ev)
                except (FetchError, LLMFailed) as e:
                    yield sse("error", {"msg": str(e)})

        return StreamingResponse(events(), media_type="text/event-stream", headers={"cache-control": "no-cache", "x-accel-buffering": "no"})

    @app.post("/api/chat")
    async def chat_route(body: ChatIn, request: Request):
        banner = gate(request, "chat", "chat")
        if banner:
            text = body.message.lower()
            replies = demo_case.get("chat_replies") or []
            pick = next((r for r in replies if any(k in text for k in r["match"])), None)
            reply = (pick or {}).get("reply") or demo_case.get("chat_default") or "The Count is resting. Ask again at moonrise."
            return {"reply": reply, "banner": banner}
        try:
            reply = await chat(state["ctx"], body.model_dump())
        except LLMFailed as e:
            return JSONResponse({"error": str(e)}, status_code=422)
        return {"reply": reply}

    @app.post("/api/ideas")
    async def ideas_route(body: IdeasIn, request: Request):
        if body.mode == "judge" and not [i for i in body.ideas if i.strip()]:
            return JSONResponse({"error": "Give the Count at least one idea, mortal."}, status_code=400)
        banner = gate(request, "ideas")
        if banner:
            if body.mode == "generate":
                return {"mode": "generate", "ideas": demo_case["generated"], "banner": banner,
                        "count_says": "From memory, mortal: three ideas nobody else in this jury's pile has built."}
            judged = demo_case["judged_ideas"]["ideas"]
            items = [{**judged[i % len(judged)], "idea": text} for i, text in enumerate(i for i in body.ideas if i.strip())]
            return {"mode": "judge", "ideas": items, "best": 0, "banner": banner}
        try:
            with tracing.span("gen_ai.invoke_agent", "invoke_agent ideate", **{"judge.mode": "ideas." + body.mode, "judge.ideas": len(body.ideas)}):
                return await ideas(state["ctx"], body.model_dump())
        except (LLMFailed, FetchError) as e:
            return JSONResponse({"error": str(e)}, status_code=422)

    @app.post("/api/debrief")
    async def debrief_route(body: DebriefIn, request: Request):
        if not (body.winners_url or body.winners_text):
            return JSONResponse({"error": "Paste the winners announcement URL (or the winning posts), mortal."}, status_code=400)
        banner = gate(request, "debrief")
        if banner:
            return {"logs": [], "debrief": {**demo_case["debrief"], "result": body.result}, "banner": banner}
        logs, out = [], None
        try:
            with tracing.span("gen_ai.invoke_agent", "invoke_agent debrief", **{"judge.mode": "debrief", "judge.result": body.result}):
                async for ev in debrief(state["ctx"], body.model_dump()):
                    if ev["type"] == "log":
                        logs.append(ev["msg"])
                    else:
                        out = ev["debrief"]
        except (LLMFailed, FetchError) as e:
            return JSONResponse({"logs": logs, "error": str(e)}, status_code=422)
        return {"logs": logs, "debrief": out}

    return app


def _production_app() -> FastAPI:
    s = load_settings()
    tracing.init(s.sentry_dsn, s.sentry_traces_sample_rate)
    return create_app(s)


app = _production_app()

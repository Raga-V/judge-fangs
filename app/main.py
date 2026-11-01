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
from .config import Settings, load_settings
from .fetchers import Fetcher, Resolver, default_resolver
from .judge import Context, identify_screen, log, run_review, screen_request
from .limits import ADJOURNED, BodyCapMiddleware, DailyCap, RateLimiter, client_ip
from .llm import LLMFailed
from .voice import AudioCache, VoiceRegistry, synthesize, text_hash

DEMO_DIR = Path(__file__).parent / "demo"
DEMO_BANNER = "Demo mode: the Count recites a past judgement. The live tribunal needs LLM_API_KEY on the server."
ADJOURNED_BANNER = f"{ADJOURNED} Here is a past judgement instead."
SCREEN_LIMIT = 1024 * 1024


def load_demos() -> dict[str, dict]:
    out = {}
    for f in sorted(DEMO_DIR.glob("*.json")):
        v = json.loads(f.read_text(encoding="utf-8"))
        out[v["id"]] = v
    return out


class ReviewIn(BaseModel):
    mode: Literal["hackathon", "email", "idea"] = "hackathon"
    hackathon_url: str | None = Field(None, max_length=500)
    hackathon_text: str | None = Field(None, max_length=30000)
    submission_url: str | None = Field(None, max_length=500)
    submission_text: str | None = Field(None, max_length=40000)
    context: str | None = Field(None, max_length=2000)
    winners_url: str | None = Field(None, max_length=500)
    exclude_urls: list[str] = Field(default_factory=list, max_length=25)

    @field_validator("hackathon_url", "hackathon_text", "submission_url", "submission_text", "context", "winners_url", mode="before")
    @classmethod
    def blank_is_none(cls, v: Any) -> Any:
        return v.strip() or None if isinstance(v, str) else v


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
    registry = VoiceRegistry(now=now)
    for d in demos.values():
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
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_methods=["GET", "POST"],
                       allow_headers=["content-type"], max_age=600)
    app.add_middleware(BodyCapMiddleware, default=64 * 1024, overrides={"/api/judge-screen": SCREEN_LIMIT})
    limiter = RateLimiter({"review": settings.rate_reviews, "backtest": settings.rate_backtest, "voice": settings.rate_voice}, now=now)
    caps = DailyCap({"review": settings.daily_review_cap, "voice": settings.daily_voice_cap}, now=now)
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

    def gate(request: Request, bucket: str) -> str | None:
        """None if the live tribunal may sit; otherwise a banner explaining the demo verdict."""
        if settings.demo_mode:
            return DEMO_BANNER
        ok, _ = limiter.take(bucket, client_ip(request, settings.trust_proxy))
        if not ok or caps.reached("review"):
            return ADJOURNED_BANNER
        caps.add("review")
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

    return app


def _production_app() -> FastAPI:
    s = load_settings()
    tracing.init(s.sentry_dsn, s.sentry_traces_sample_rate)
    return create_app(s)


app = _production_app()

"""All configuration comes from environment variables. See .env.example."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field


def _bool(v: str | None, default: bool = False) -> bool:
    if v is None or v == "":
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


def _int(v: str | None, default: int) -> int:
    try:
        return int(v) if v not in (None, "") else default
    except ValueError:
        return default


def is_local_url(url: str) -> bool:
    return bool(re.match(r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)(:\d+)?(/|$)", url or "", re.I))


@dataclass
class Settings:
    llm_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    llm_api_key: str = ""
    llm_model: str = "gemma-4-31b-it"
    llm_timeout: float = 240.0
    llm_thinking_tokens: int = 3000
    llm_fallback_model: str = ""
    llm_retry_delay: float = 3.0
    demo_mode_forced: bool = False
    web_origin: str = ""
    github_token: str = ""
    serpapi_key: str = ""
    eleven_key: str = ""
    eleven_voice_id: str = "onwK4e9ZLuTAKqWW03F9"
    eleven_model: str = "eleven_v3"
    eleven_fallback_model: str = "eleven_multilingual_v2"
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 1.0
    daily_review_cap: int = 300
    daily_voice_cap: int = 300
    rate_reviews: int = 6
    rate_backtest: int = 25
    rate_voice: int = 12
    rate_cases: int = 6
    rate_chat: int = 30
    rate_ideas: int = 12
    rate_debrief: int = 6
    daily_chat_cap: int = 1000
    trust_proxy: bool = True
    cache_dir: str = "app/.cache"
    source_char_cap: int = 12000
    extra_origins: list[str] = field(default_factory=list)

    @property
    def llm_configured(self) -> bool:
        # a self-hosted server on localhost needs no key
        return bool(self.llm_api_key) or is_local_url(self.llm_base_url)

    @property
    def demo_mode(self) -> bool:
        return self.demo_mode_forced or not self.llm_configured

    @property
    def allowed_origins(self) -> list[str]:
        origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]
        if self.web_origin:
            origins.append(self.web_origin.rstrip("/"))
        return origins + self.extra_origins


def load_settings(env: dict[str, str] | None = None) -> Settings:
    e = os.environ if env is None else env
    web = (e.get("WEB_ORIGIN") or "").strip().rstrip("/")
    if web and not web.startswith("http"):
        web = "https://" + web  # Render's fromService "host" gives a bare hostname
    return Settings(
        llm_base_url=e.get("LLM_BASE_URL") or Settings.llm_base_url,
        llm_api_key=e.get("LLM_API_KEY", ""),
        llm_model=e.get("LLM_MODEL") or Settings.llm_model,
        llm_timeout=float(e.get("LLM_TIMEOUT") or 240),
        llm_thinking_tokens=_int(e.get("LLM_THINKING_TOKENS"), 3000),
        llm_fallback_model=e.get("LLM_FALLBACK_MODEL", ""),
        llm_retry_delay=float(e.get("LLM_RETRY_DELAY") or 3),
        demo_mode_forced=_bool(e.get("DEMO_MODE")),
        web_origin=web,
        github_token=e.get("GITHUB_TOKEN", ""),
        serpapi_key=e.get("SERPAPI_KEY", ""),
        eleven_key=e.get("ELEVENLABS_API_KEY", ""),
        eleven_voice_id=e.get("ELEVENLABS_VOICE_ID") or Settings.eleven_voice_id,
        eleven_model=e.get("ELEVENLABS_MODEL") or Settings.eleven_model,
        eleven_fallback_model=e.get("ELEVENLABS_FALLBACK_MODEL") or Settings.eleven_fallback_model,
        sentry_dsn=e.get("SENTRY_DSN", ""),
        sentry_traces_sample_rate=float(e.get("SENTRY_TRACES_SAMPLE_RATE") or 1.0),
        daily_review_cap=_int(e.get("DAILY_REVIEW_CAP"), 300),
        daily_voice_cap=_int(e.get("DAILY_VOICE_CAP"), 300),
        rate_reviews=_int(e.get("RATE_REVIEWS_PER_10M"), 6),
        rate_backtest=_int(e.get("RATE_BACKTEST_PER_10M"), 25),
        rate_voice=_int(e.get("RATE_VOICE_PER_10M"), 12),
        rate_cases=_int(e.get("RATE_CASES_PER_10M"), 6),
        rate_chat=_int(e.get("RATE_CHAT_PER_10M"), 30),
        rate_ideas=_int(e.get("RATE_IDEAS_PER_10M"), 12),
        rate_debrief=_int(e.get("RATE_DEBRIEF_PER_10M"), 6),
        daily_chat_cap=_int(e.get("DAILY_CHAT_CAP"), 1000),
        trust_proxy=_bool(e.get("TRUST_PROXY"), True),
        cache_dir=e.get("CACHE_DIR") or "app/.cache",
        extra_origins=[o.strip().rstrip("/") for o in (e.get("EXTRA_ORIGINS") or "").split(",") if o.strip()],
    )

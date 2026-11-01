"""ElevenLabs text-to-speech for "Hear the sentence".
Only text this server generated can be voiced, and audio is cached by text hash."""
from __future__ import annotations

import hashlib
import time
from collections import OrderedDict
from pathlib import Path

import httpx

from . import tracing
from .config import Settings

ELEVEN = "https://api.elevenlabs.io"


def text_hash(text: str) -> str:
    return hashlib.sha256(("v1\n" + text.strip()).encode()).hexdigest()


class VoiceRegistry:
    """Hashes of voice lines the server wrote (short-lived) plus demo lines (permanent)."""

    def __init__(self, ttl: float = 2 * 3600, now=time.time):
        self.ttl, self.now = ttl, now
        self.recent: dict[str, float] = {}
        self.permanent: set[str] = set()

    def add(self, text: str) -> None:
        self.recent[text_hash(text)] = self.now() + self.ttl
        if len(self.recent) > 5000:
            t = self.now()
            self.recent = {k: v for k, v in self.recent.items() if v > t}

    def add_permanent(self, text: str) -> None:
        self.permanent.add(text_hash(text))

    def allowed(self, text: str) -> bool:
        h = text_hash(text)
        return h in self.permanent or self.recent.get(h, 0) > self.now()


class AudioCache:
    def __init__(self, directory: str | None, max_items: int = 200):
        self.dir = Path(directory) if directory else None
        self.mem: OrderedDict[str, bytes] = OrderedDict()
        self.max_items = max_items
        if self.dir:
            try:
                self.dir.mkdir(parents=True, exist_ok=True)
            except OSError:
                self.dir = None

    def get(self, key: str) -> bytes | None:
        if key in self.mem:
            self.mem.move_to_end(key)
            return self.mem[key]
        if self.dir and (self.dir / f"{key}.mp3").exists():
            data = (self.dir / f"{key}.mp3").read_bytes()
            self._remember(key, data)
            return data
        return None

    def set(self, key: str, data: bytes) -> None:
        self._remember(key, data)
        if self.dir:
            try:
                (self.dir / f"{key}.mp3").write_bytes(data)
            except OSError:
                pass

    def _remember(self, key: str, data: bytes) -> None:
        self.mem[key] = data
        self.mem.move_to_end(key)
        while len(self.mem) > self.max_items:
            self.mem.popitem(last=False)


def tagged(text: str) -> str:
    """eleven_v3 audio tags for a severe judge."""
    return "[clears throat] [coldly] " + text


async def _tts(settings: Settings, client: httpx.AsyncClient, text: str, model: str) -> bytes:
    body: dict = {"text": text, "model_id": model}
    if model != "eleven_v3":
        body["voice_settings"] = {"stability": 0.55, "similarity_boost": 0.8, "style": 0.3}
    r = await client.post(
        f"{ELEVEN}/v1/text-to-speech/{settings.eleven_voice_id}?output_format=mp3_44100_128",
        json=body,
        headers={"xi-api-key": settings.eleven_key, "accept": "audio/mpeg"},
        timeout=60.0,
    )
    if r.status_code >= 400:
        raise httpx.HTTPStatusError(f"ElevenLabs HTTP {r.status_code}", request=r.request, response=r)
    return r.content


async def synthesize(settings: Settings, client: httpx.AsyncClient, text: str) -> bytes:
    t0 = time.perf_counter()
    with tracing.span("ai.tts", "elevenlabs tts", **{"judge.text_chars": len(text)}) as s:
        try:
            audio = await _tts(settings, client, tagged(text), settings.eleven_model)
            s.set_data("gen_ai.request.model", settings.eleven_model)
        except httpx.HTTPError:
            tracing.capture("tts primary model failed", model=settings.eleven_model)
            audio = await _tts(settings, client, text, settings.eleven_fallback_model)
            s.set_data("gen_ai.request.model", settings.eleven_fallback_model)
        s.set_data("judge.latency_ms", int((time.perf_counter() - t0) * 1000))
        s.set_data("judge.audio_bytes", len(audio))
    return audio

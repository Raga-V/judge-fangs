"""Per-IP sliding-window rate limits, global daily caps, and the body-size cap."""
from __future__ import annotations

import datetime as dt
import time
from collections import defaultdict, deque

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

ADJOURNED = "The tribunal is adjourned until moonrise."


class RateLimiter:
    def __init__(self, limits: dict[str, int], window: float = 600, now=time.time):
        self.limits, self.window, self.now = limits, window, now
        self.hits: dict[str, deque] = defaultdict(deque)

    def take(self, bucket: str, ip: str) -> tuple[bool, int]:
        """(allowed, retry_after_seconds)."""
        limit = self.limits.get(bucket)
        if limit is None:
            return True, 0
        t = self.now()
        q = self.hits[f"{bucket}|{ip}"]
        while q and q[0] <= t - self.window:
            q.popleft()
        if len(q) >= limit:
            return False, max(1, int(q[0] + self.window - t))
        q.append(t)
        if len(self.hits) > 20000:
            for k in [k for k, v in self.hits.items() if not v or v[-1] <= t - self.window]:
                del self.hits[k]
        return True, 0


class DailyCap:
    def __init__(self, caps: dict[str, int], now=time.time):
        self.caps, self.now = caps, now
        self.day, self.counts = "", defaultdict(int)

    def _roll(self) -> None:
        day = dt.datetime.fromtimestamp(self.now(), dt.timezone.utc).date().isoformat()
        if day != self.day:
            self.day, self.counts = day, defaultdict(int)

    def reached(self, kind: str) -> bool:
        self._roll()
        cap = self.caps.get(kind)
        return cap is not None and self.counts[kind] >= cap

    def add(self, kind: str) -> None:
        self._roll()
        self.counts[kind] += 1


def client_ip(request: Request, trust_proxy: bool) -> str:
    if trust_proxy:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class BodyCapMiddleware:
    """Refuse bodies over the cap (64 KB; 1 MB for /api/judge-screen), by header and by actual size."""

    def __init__(self, app: ASGIApp, default: int = 64 * 1024, overrides: dict[str, int] | None = None):
        self.app, self.default, self.overrides = app, default, overrides or {}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        limit = self.overrides.get(scope.get("path", ""), self.default)
        too_big = JSONResponse({"error": "That is far too long, mortal. The tribunal reads at most %d KB." % (limit // 1024)}, status_code=413)
        for k, v in scope.get("headers", []):
            if k == b"content-length" and v.isdigit() and int(v) > limit:
                return await too_big(scope, receive, send)
        received = 0

        async def capped_receive():
            nonlocal received
            msg = await receive()
            if msg["type"] == "http.request":
                received += len(msg.get("body", b""))
                if received > limit:
                    raise _TooBig()
            return msg

        try:
            await self.app(scope, capped_receive, send)
        except _TooBig:
            await too_big(scope, receive, send)


class _TooBig(Exception):
    pass

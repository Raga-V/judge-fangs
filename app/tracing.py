"""Optional Sentry agent tracing. Only lengths, labels and timings are recorded:
never submission text, emails, ideas, screenshots or model output."""
from __future__ import annotations

import contextlib
from typing import Any, Iterator

_sentry: Any = None


class _NoopSpan:
    def set_data(self, *_: Any) -> None: ...
    def set_tag(self, *_: Any) -> None: ...
    def set_status(self, *_: Any) -> None: ...


def _scrub(event: dict, _hint: Any = None) -> dict:
    req = event.get("request")
    if isinstance(req, dict):
        for k in ("data", "cookies", "query_string", "env"):
            req.pop(k, None)
        headers = req.get("headers")
        if isinstance(headers, dict):
            req["headers"] = {k: v for k, v in headers.items() if k.lower() in {"user-agent", "content-type", "content-length", "origin"}}
    user = event.get("user")
    if isinstance(user, dict):
        user.pop("ip_address", None)
    return event


def init(dsn: str, sample_rate: float = 1.0) -> bool:
    global _sentry
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:  # pragma: no cover
        return False
    sentry_sdk.init(
        dsn=dsn,
        traces_sample_rate=sample_rate,
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        before_send=_scrub,
        before_send_transaction=_scrub,
    )
    _sentry = sentry_sdk
    return True


def enabled() -> bool:
    return _sentry is not None


@contextlib.contextmanager
def span(op: str, name: str, **data: Any) -> Iterator[Any]:
    """A child span (or a root transaction if none is active). data: numbers and short labels only."""
    if _sentry is None:
        yield _NoopSpan()
        return
    with _sentry.start_span(op=op, name=name) as s:
        for k, v in data.items():
            s.set_data(k, v)
        yield s


def capture(message: str, **tags: Any) -> None:
    """Record an error by label. The message must never contain user or model text."""
    if _sentry is None:
        return
    with _sentry.new_scope() as scope:
        for k, v in tags.items():
            scope.set_tag(k, str(v))
        _sentry.capture_message(message, level="error")

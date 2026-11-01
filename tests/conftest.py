import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import load_settings
from app.main import create_app

FIXTURES = Path(__file__).parent / "fixtures"


async def public_resolver(host: str) -> list[str]:
    return ["93.184.216.34"]


def llm_reply(obj) -> httpx.Response:
    content = obj if isinstance(obj, str) else json.dumps(obj)
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}],
                                     "usage": {"prompt_tokens": 120, "completion_tokens": 80}})


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def make_client(tmp_path):
    clients = []

    def _make(env: dict | None = None, handler=None, now=None) -> TestClient:
        settings = load_settings({"CACHE_DIR": str(tmp_path / "cache"), **(env or {})})
        transport = httpx.MockTransport(handler or (lambda r: httpx.Response(404)))
        kwargs = {"now": now} if now else {}
        app = create_app(settings, transport=transport, resolver=public_resolver, **kwargs)
        c = TestClient(app)
        c.__enter__()
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.__exit__(None, None, None)

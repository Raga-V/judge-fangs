import asyncio
import json

import httpx
import pytest

from app.config import load_settings
from app.llm import LLMError, LLMFailed, complete_json, extract_json
from tests.conftest import llm_reply

SETTINGS = load_settings({"LLM_API_KEY": "k", "LLM_MODEL": "gemma-3-27b-it"})


def run(coro):
    return asyncio.run(coro)


def test_extract_json_variants():
    assert extract_json('{"a": 1}') == {"a": 1}
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Here you go, mortal: {"t": "a } brace", "n": 2} — hope that helps') == {"t": "a } brace", "n": 2}
    assert extract_json('{“a”: “b”,}') == {"a": "b"}
    assert extract_json('{"a": "cut off') == {"a": "cut off"}
    assert extract_json('{"text": "line one\nline two"}') == {"text": "line one\nline two"}  # raw newline in a string
    with pytest.raises(LLMError, match="did not contain"):
        extract_json("no json at all")
    with pytest.raises(LLMError):
        extract_json("{not: json}")


def test_errors_never_echo_the_reply():
    with pytest.raises(LLMError) as e:
        extract_json("{secret submission text")
    assert "secret" not in str(e.value)


class Recorder:
    def __init__(self, replies):
        self.replies, self.bodies = list(replies), []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.bodies.append(json.loads(request.content))
        r = self.replies.pop(0)
        return r if isinstance(r, httpx.Response) else llm_reply(r)


def call(rec, **kw):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(rec)) as c:
            return await complete_json(SETTINGS, c, "PROMPT", **kw)
    return run(go())


def test_single_user_message_no_system_role_no_json_mode():
    rec = Recorder(['{"ok": true}'])
    assert call(rec) == {"ok": True}
    body = rec.bodies[0]
    assert [m["role"] for m in body["messages"]] == ["user"]
    assert "response_format" not in body
    assert body["model"] == "gemma-3-27b-it"


def test_retry_once_with_the_error_explained():
    rec = Recorder(["I refuse to write JSON", '{"ok": 1}'])
    assert call(rec) == {"ok": 1}
    second = rec.bodies[1]["messages"]
    assert [m["role"] for m in second] == ["user", "assistant", "user"]
    assert "could not be used because" in second[2]["content"]


def test_validation_errors_also_retry():
    def validate(o):
        if "fixes" not in o:
            raise LLMError('"fixes" is missing', "validation")
        return o
    rec = Recorder(['{"nope": 1}', '{"fixes": [1, 2, 3]}'])
    assert call(rec, validate=validate) == {"fixes": [1, 2, 3]}
    assert '"fixes" is missing' in rec.bodies[1]["messages"][2]["content"]


def test_two_failures_raise_a_graceful_error():
    rec = Recorder(["nope", "still nope"])
    with pytest.raises(LLMFailed, match="quill snapped"):
        call(rec)


def test_http_errors_retry_plainly():
    rec = Recorder([httpx.Response(503), '{"ok": 2}'])
    assert call(rec) == {"ok": 2}
    assert len(rec.bodies[1]["messages"]) == 1


def test_images_become_content_parts():
    rec = Recorder(['{"kind": "email"}'])
    call(rec, images=["data:image/jpeg;base64,AAAA"])
    content = rec.bodies[0]["messages"][0]["content"]
    assert content[0] == {"type": "text", "text": "PROMPT"}
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg")


def test_local_server_needs_no_key_and_missing_key_means_demo():
    assert load_settings({}).demo_mode is True
    assert load_settings({"LLM_BASE_URL": "http://localhost:11434/v1"}).demo_mode is False
    assert load_settings({"LLM_API_KEY": "k", "DEMO_MODE": "true"}).demo_mode is True

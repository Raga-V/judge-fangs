"""Calls a hosted open-weight model (Gemma by default) through any
OpenAI-compatible chat completions API. All instructions go in one user
message, because some Gemma providers reject a system role and JSON mode."""
from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any, Callable

import httpx

from . import tracing
from .config import Settings


class LLMError(Exception):
    def __init__(self, message: str, kind: str = "llm"):
        super().__init__(message)
        self.kind = kind


class LLMFailed(Exception):
    """Both attempts failed. The message is safe to show to the user."""


async def call_llm(
    settings: Settings,
    client: httpx.AsyncClient,
    messages: list[dict],
    *,
    max_tokens: int = 1500,
    temperature: float = 0.4,
    attempt: int = 1,
    label: str = "judge",
    model: str | None = None,
) -> str:
    model = model or settings.llm_model
    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    headers = {"content-type": "application/json"}
    if settings.llm_api_key:
        headers["authorization"] = f"Bearer {settings.llm_api_key}"
    if "openrouter.ai" in settings.llm_base_url:
        headers["HTTP-Referer"] = settings.web_origin or "https://judge-fangs.onrender.com"
        headers["X-Title"] = "Judge Fangs"
    # headroom for models that think before answering; harmless for those that don't
    body = {"model": model, "messages": messages, "max_tokens": max_tokens + settings.llm_thinking_tokens, "temperature": temperature}
    prompt_chars = sum(len(m["content"]) if isinstance(m["content"], str) else sum(len(p.get("text", "")) for p in m["content"]) for m in messages)
    t0 = time.perf_counter()
    with tracing.span("gen_ai.chat", f"chat {model}", **{
        "gen_ai.operation.name": "chat",
        "gen_ai.system": "openai-compatible",
        "gen_ai.request.model": model,
        "gen_ai.request.max_tokens": max_tokens,
        "judge.attempt": attempt,
        "judge.step": label,
        "judge.prompt_chars": prompt_chars,
    }) as s:
        try:
            r = await client.post(url, json=body, headers=headers, timeout=settings.llm_timeout)
        except httpx.TimeoutException as e:
            raise LLMError("the model took too long to answer", "network") from e
        except httpx.HTTPError as e:
            raise LLMError("could not reach the model server", "network") from e
        s.set_data("judge.latency_ms", int((time.perf_counter() - t0) * 1000))
        if r.status_code >= 400:
            s.set_data("http.status_code", r.status_code)
            if r.status_code in (429, 500, 502, 503, 504):
                raise LLMError(f"the model server is overloaded (HTTP {r.status_code})", "busy")
            raise LLMError(f"the model server answered HTTP {r.status_code}", "http")
        try:
            data = r.json()
            content = data["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as e:
            raise LLMError("the model server sent an unexpected reply", "http") from e
        if isinstance(content, list):  # some providers return content parts
            content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
        if not content:
            raise LLMError("the model returned an empty message", "empty")
        usage = data.get("usage") or {}
        if usage.get("prompt_tokens") is not None:
            s.set_data("gen_ai.usage.input_tokens", usage["prompt_tokens"])
        if usage.get("completion_tokens") is not None:
            s.set_data("gen_ai.usage.output_tokens", usage["completion_tokens"])
        s.set_data("judge.output_chars", len(content))
        return content


_SMART = str.maketrans({"“": '"', "”": '"'})
_THOUGHT = re.compile(r"<(thought|think|thinking)>.*?</\1>", re.S | re.I)


def strip_thinking(raw: str) -> str:
    """Thinking models (Gemma 4 on AI Studio) write <thought>...</thought> before the answer.
    Drop it so braces inside the reasoning can't be mistaken for the JSON."""
    s = _THOUGHT.sub("", raw)
    if re.search(r"<(thought|think|thinking)>", s, re.I):
        raise LLMError("the reply ran out of room while still thinking", "truncated")
    return s


def _balanced(s: str, start: int) -> tuple[str, bool, bool]:
    """(candidate, closed, ended_inside_a_string) for the object starting at s[start]."""
    depth, in_str, esc = 0, False, False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[start:i + 1], True, False
    return s[start:], False, in_str


def _parse(cand: str, closed: bool, in_str: bool) -> dict | None:
    attempts = [cand, re.sub(r",\s*([}\]])", r"\1", cand.translate(_SMART))]
    if not closed:
        attempts.append(re.sub(r",?\s*$", "", cand) + ('"}' if in_str else "}"))
    for a in attempts:
        try:
            v = json.loads(a, strict=False)
        except ValueError:
            continue
        if isinstance(v, dict):
            return v
    return None


def extract_json(raw: str) -> dict:
    """Pull the JSON object out of a model reply: the largest balanced object that parses
    (models sometimes show a small example before the real answer).
    Handles thinking blocks, code fences, chatter, smart quotes and trailing commas.
    Error messages never echo the reply."""
    if not isinstance(raw, str):
        raise LLMError("there was no text to parse", "json")
    s = re.sub(r"```(?:json)?", "", strip_thinking(raw), flags=re.I).strip()
    if "{" not in s:
        raise LLMError("the reply did not contain a JSON object", "json")
    best: dict | None = None
    best_len = -1
    i = s.find("{")
    while i != -1:
        cand, closed, in_str = _balanced(s, i)
        v = _parse(cand, closed, in_str)
        if v is not None and len(cand) > best_len:
            best, best_len = v, len(cand)
        # skip past a parsed object; otherwise try the next brace
        i = s.find("{", i + (len(cand) if v is not None else 1))
    if best is None:
        raise LLMError("the reply was not valid JSON", "json")
    return best


async def complete_json(
    settings: Settings,
    client: httpx.AsyncClient,
    prompt: str,
    *,
    validate: Callable[[dict], dict] | None = None,
    label: str = "judge",
    max_tokens: int = 1500,
    images: list[str] | None = None,
) -> dict:
    """Ask for strict JSON. On failure, retry once with the error explained.
    validate() may raise LLMError to trigger the retry, or return a cleaned dict."""
    content: Any = prompt
    if images:
        content = [{"type": "text", "text": prompt}] + [{"type": "image_url", "image_url": {"url": u}} for u in images]
    messages: list[dict] = [{"role": "user", "content": content}]
    last: Exception | None = None
    model = settings.llm_model
    for attempt in (1, 2):
        reply = ""
        try:
            reply = await call_llm(settings, client, messages, max_tokens=max_tokens, attempt=attempt, label=label, model=model)
            obj = extract_json(reply)
            return validate(obj) if validate else obj
        except LLMError as e:
            last = e
            tracing.capture(f"{label} failed: {e.kind}", step=label, attempt=attempt, kind=e.kind)
            if attempt == 2:
                break
            if e.kind == "busy":
                # the provider is overloaded: pause, then try the fallback model if there is one
                await asyncio.sleep(settings.llm_retry_delay)
                model = settings.llm_fallback_model or model
                continue
            if e.kind in ("network", "http", "empty", "truncated"):
                continue  # plain retry
            answer = _THOUGHT.sub("", reply).strip()  # never feed the reasoning back
            if answer:
                messages.append({"role": "assistant", "content": answer[:4000]})
            messages.append({
                "role": "user",
                "content": f"Your previous reply could not be used because {e}. "
                           "Reply again with ONLY the JSON object described above. No code fences, no commentary.",
            })
    raise LLMFailed(f"The Count's quill snapped twice ({last}). Try again in a moment.")

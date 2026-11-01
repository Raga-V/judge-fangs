"""Calls a hosted open-weight model (Gemma by default) through any
OpenAI-compatible chat completions API. All instructions go in one user
message, because some Gemma providers reject a system role and JSON mode."""
from __future__ import annotations

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
) -> str:
    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    headers = {"content-type": "application/json"}
    if settings.llm_api_key:
        headers["authorization"] = f"Bearer {settings.llm_api_key}"
    if "openrouter.ai" in settings.llm_base_url:
        headers["HTTP-Referer"] = settings.web_origin or "https://judge-fangs.onrender.com"
        headers["X-Title"] = "Judge Fangs"
    body = {"model": settings.llm_model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    prompt_chars = sum(len(m["content"]) if isinstance(m["content"], str) else sum(len(p.get("text", "")) for p in m["content"]) for m in messages)
    t0 = time.perf_counter()
    with tracing.span("gen_ai.chat", f"chat {settings.llm_model}", **{
        "gen_ai.operation.name": "chat",
        "gen_ai.system": "openai-compatible",
        "gen_ai.request.model": settings.llm_model,
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


def extract_json(raw: str) -> dict:
    """Pull the first balanced JSON object out of a model reply.
    Handles code fences, chatter around it, smart quotes and trailing commas.
    Error messages never echo the reply."""
    if not isinstance(raw, str):
        raise LLMError("there was no text to parse", "json")
    s = re.sub(r"```(?:json)?", "", raw, flags=re.I).strip()
    start = s.find("{")
    if start == -1:
        raise LLMError("the reply did not contain a JSON object", "json")
    depth, in_str, esc, end = 0, False, False, -1
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
                end = i
                break
    cand = s[start:] if end == -1 else s[start:end + 1]
    attempts = [cand, re.sub(r",\s*([}\]])", r"\1", cand.translate(_SMART))]
    if end == -1:
        attempts.append(re.sub(r",?\s*$", "", cand) + ('"}' if in_str else "}"))
    for a in attempts:
        try:
            v = json.loads(a, strict=False)
        except ValueError:
            continue
        if isinstance(v, dict):
            return v
    raise LLMError("the reply was not valid JSON", "json")


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
    for attempt in (1, 2):
        reply = ""
        try:
            reply = await call_llm(settings, client, messages, max_tokens=max_tokens, attempt=attempt, label=label)
            obj = extract_json(reply)
            return validate(obj) if validate else obj
        except LLMError as e:
            last = e
            tracing.capture(f"{label} failed: {e.kind}", step=label, attempt=attempt, kind=e.kind)
            if attempt == 2:
                break
            if e.kind in ("network", "http", "empty"):
                continue  # plain retry
            if reply:
                messages.append({"role": "assistant", "content": reply[:4000]})
            messages.append({
                "role": "user",
                "content": f"Your previous reply could not be used because {e}. "
                           "Reply again with ONLY the JSON object described above. No code fences, no commentary.",
            })
    raise LLMFailed(f"The Count's quill snapped twice ({last}). Try again in a moment.")

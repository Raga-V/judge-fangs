import json

import httpx
import pytest

from app import judge
from tests.conftest import llm_reply

LIVE = {"LLM_API_KEY": "test-key", "WEB_ORIGIN": "https://fangs-web.onrender.com"}

POST_BODY = """I built a notes app. Code: https://github.com/jane/notes

It turns messy lecture notes into a study sheet in 5 minutes.

I'm going for Best Use of Sentry because I love Sentry.
"""


@pytest.fixture(autouse=True)
def clear_cache():
    judge._CACHE.clear()


def world(llm_calls: list, judge_reply: dict | None = None):
    """A fake internet: DEV, GitHub and the model server."""
    def handler(req: httpx.Request) -> httpx.Response:
        url = str(req.url)
        if req.url.host == "dev.to":
            path = req.url.path
            if path == "/api/articles/jane/my-notes-app":
                return httpx.Response(200, json={"title": "My Notes App", "body_markdown": POST_BODY, "tags": ["devchallenge"],
                                                 "published_at": "2026-10-30", "public_reactions_count": 3, "url": "https://dev.to/jane/my-notes-app"})
            if path == "/api/articles/devteam/the-challenge":
                return httpx.Response(200, json={"title": "The Example Challenge", "body_markdown": "Judging: creativity, use of tech. Prizes: Best Use of Sentry.", "url": "https://dev.to/devteam/the-challenge"})
            if path == "/api/articles/devteam/winners":
                return httpx.Response(200, json={"title": "Winners!", "url": "https://dev.to/devteam/winners",
                                                 "body_markdown": "{% embed https://dev.to/w1/first %}\n{% embed https://dev.to/jane/my-notes-app %}\nhttps://dev.to/w2/second"})
            if path in ("/api/articles/w1/first", "/api/articles/w2/second"):
                return httpx.Response(200, json={"title": f"I Saved 3 Hours with {path[-5:]}", "body_markdown": "![x](https://a.png) A measured test.", "url": "https://dev.to" + path.replace("/api/articles", "")})
        if req.url.host == "api.github.com":
            p = req.url.path
            if p == "/repos/jane/notes":
                return httpx.Response(200, json={"default_branch": "main", "description": "notes", "stargazers_count": 1})
            if p == "/repos/jane/notes/git/trees/main":
                return httpx.Response(200, json={"tree": [{"path": "requirements.txt", "type": "blob", "size": 50}, {"path": "app/main.py", "type": "blob", "size": 80}]})
            if p == "/repos/jane/notes/languages":
                return httpx.Response(200, json={"Python": 100})
            if p == "/repos/jane/notes/readme":
                return httpx.Response(200, text="# Notes\nA notes app.")
            if p == "/repos/jane/notes/commits":
                return httpx.Response(200, json=[{}], headers={"link": '<https://api.github.com/repos/jane/notes/commits?per_page=1&page=12>; rel="last"'})
        if req.url.host == "raw.githubusercontent.com":
            if url.endswith("requirements.txt"):
                return httpx.Response(200, text="fastapi==0.115\n")
            return httpx.Response(200, text="from fastapi import FastAPI\n")
        if url.endswith("/chat/completions"):
            prompt = json.loads(req.content)["messages"][0]["content"]
            if isinstance(prompt, list):
                prompt = prompt[0]["text"]
            llm_calls.append(prompt)
            if "Extract the facts" in prompt:
                return llm_reply({"name": "The Example Challenge", "theme": "notes", "deadline": "Nov 1",
                                  "criteria": [{"name": "Creativity", "weight": "50%"}, {"name": "Use of tech", "weight": "50%"}],
                                  "prize_categories": ["Best Use of Sentry"]})
            if "These posts WON" in prompt:
                return llm_reply({"patterns": ["A number in the title", "A measured test"]})
            if "Judge this hackathon submission" in prompt:
                return llm_reply(judge_reply or {
                    "overall": 140,
                    "criteria": [
                        {"name": "Creativity", "score": 14, "verdict": "Common idea.", "evidence_quote": "turns messy lecture notes into a study sheet"},
                        {"name": "Use of tech", "score": 3, "verdict": "Thin.", "evidence_quote": "I used Gemma with a custom RAG pipeline"},
                    ],
                    "why_not_winning": ["No numbers.", "No demo."],
                    "top_fixes": ["Add a demo.", "Add a number.", "Add Sentry for real.", "A fourth fix."],
                    "better_title": "Messy Notes to Study Sheet in 5 Minutes",
                    "better_opening": " ".join(["word"] * 80),
                    "partner_claims": [{"partner": "Sentry", "used": True}],
                    "count_says": "Mortal, adequate.",
                })
        return httpx.Response(404, json={"error": "not in this fake world: " + url})
    return handler


REVIEW = {"submission_url": "https://dev.to/jane/my-notes-app", "hackathon_url": "https://dev.to/devteam/the-challenge",
          "winners_url": "https://dev.to/devteam/winners"}


def test_healthz_config_and_demos_with_no_keys(make_client):
    c = make_client({})
    assert c.get("/healthz").text == "ok"
    cfg = c.get("/api/config").json()
    assert cfg["demo"] is True and cfg["banner"]
    demos = c.get("/api/demo").json()
    assert {d["id"] for d in demos} == {"example-strong", "example-weak"}
    weak = c.get("/api/demo/example-weak").json()
    assert weak["overall"] < 50 and weak["count_says"].startswith("Objection. To all of it.")
    assert c.get("/api/demo/nope").status_code == 404


def test_review_in_demo_mode_returns_an_example_with_a_banner(make_client):
    c = make_client({})
    r = c.post("/api/review", json={"submission_text": "my post"})
    assert r.status_code == 200
    v = r.json()["verdict"]
    assert v["demo"] is True and "Demo mode" in v["banner"]


def test_stream_is_server_sent_events(make_client):
    c = make_client({})
    with c.stream("POST", "/api/review/stream", json={"submission_text": "x"}) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        body = "".join(r.iter_text())
    events = [blk.split("\n")[0] for blk in body.strip().split("\n\n")]
    assert events[:2] == ["event: log", "event: log"] and events[-1] == "event: verdict"


def test_full_hackathon_review_with_guard_rails(make_client):
    calls: list = []
    c = make_client(LIVE, world(calls))
    r = c.post("/api/review", json=REVIEW)
    assert r.status_code == 200, r.text
    body = r.json()
    v = body["verdict"]
    # clamped scores
    assert v["overall"] == 100
    assert v["criteria"][0]["score"] == 10
    # the real quote survives, the invented one is struck and marked unsupported
    assert v["criteria"][0]["supported"] is True
    assert v["criteria"][1]["evidence_quote"] is None and v["criteria"][1]["supported"] is False
    assert any("Struck 1 quote" in m for m in body["logs"])
    # the model said Sentry is used; the repo has no trace of it, so the code check overrules
    assert v["partners"] == [{"partner": "Sentry", "status": "not_found", "evidence": [], "claim": "Best Use of Sentry", "overruled": True}]
    assert any("overruled the model" in o for o in v["overrules"])
    # exactly 3 fixes, opening capped at 60 words
    assert len(v["top_fixes"]) == 3
    assert len(v["better_opening"].split()) <= 60
    assert v["expression"] == "impressed"
    assert v["voice_line"].endswith("Overall: 100 out of one hundred.")
    # winners' patterns were built without the post being judged
    assert all("jane/my-notes-app" not in p for p in calls if "These posts WON" in p)
    assert v["patterns"] == ["A number in the title", "A measured test"]
    assert {s["url"] for s in v["sources"] if s["url"]} >= {"https://dev.to/jane/my-notes-app", "https://github.com/jane/notes"}
    # the verdict can be fetched again for an hour (desktop "Open full verdict")
    assert c.get(f"/api/verdict/{v['id']}").json()["id"] == v["id"]


def test_code_check_overrules_the_model(make_client):
    calls: list = []
    post = POST_BODY + "\nI also wired Auth0 for login. Best Use of Auth0"
    handler = world(calls)

    def h(req):
        if req.url.path == "/api/articles/jane/my-notes-app":
            return httpx.Response(200, json={"title": "My Notes App", "body_markdown": post, "url": "https://dev.to/jane/my-notes-app"})
        if req.url.path.endswith("/chat/completions") and "Judge this hackathon submission" in req.content.decode():
            return llm_reply({"overall": 30, "criteria": [{"name": "a", "score": 3, "verdict": "x", "evidence_quote": ""}] * 2,
                              "why_not_winning": ["a", "b"], "top_fixes": ["1", "2", "3"], "better_title": "t", "better_opening": "o",
                              "partner_claims": [{"partner": "Auth0", "used": True}], "count_says": "Mortal."})
        return handler(req)
    c = make_client(LIVE, h)
    v = c.post("/api/review", json={**REVIEW, "winners_url": None}).json()["verdict"]
    auth0 = next(p for p in v["partners"] if p["partner"] == "Auth0")
    assert auth0["status"] == "not_found" and auth0["overruled"] is True
    assert any("overruled the model" in o for o in v["overrules"])
    assert v["count_says"].startswith("Objection. To all of it.")
    assert v["expression"] == "unimpressed"


def test_model_failure_is_graceful(make_client):
    def h(req):
        if str(req.url).endswith("/chat/completions"):
            return llm_reply("I am but a humble language model")
        return world([])(req)
    c = make_client(LIVE, h)
    r = c.post("/api/review", json=REVIEW)
    assert r.status_code == 422
    assert "quill snapped" in r.json()["error"]


def test_bad_links_are_refused_in_character(make_client):
    c = make_client(LIVE, world([]))
    r = c.post("/api/review", json={"submission_url": "https://evil.example/post"})
    assert r.status_code == 422


def test_rate_limit_adjourns_the_tribunal(make_client):
    c = make_client({**LIVE, "RATE_REVIEWS_PER_10M": "1"}, world([]))
    assert c.post("/api/review", json=REVIEW).json()["verdict"]["demo"] is False
    second = c.post("/api/review", json=REVIEW).json()["verdict"]
    assert second["demo"] is True and "adjourned until moonrise" in second["banner"]


def test_daily_cap_adjourns_too(make_client):
    c = make_client({**LIVE, "DAILY_REVIEW_CAP": "0"}, world([]))
    assert "adjourned" in c.post("/api/review", json={"submission_text": "x"}).json()["verdict"]["banner"]


def test_body_caps(make_client):
    c = make_client({})
    assert c.post("/api/review", content=b"{" + b" " * (65 * 1024) + b"}", headers={"content-type": "application/json"}).status_code == 413
    big_image = "data:image/jpeg;base64," + "A" * (200 * 1024)
    assert c.post("/api/judge-screen", json={"image": big_image}).status_code == 200  # demo mode, but the 1 MB route accepts it
    assert c.post("/api/judge-screen", content=b"x" * (1100 * 1024), headers={"content-type": "application/json"}).status_code == 413


def test_cors_only_the_web_origin(make_client):
    c = make_client(LIVE, world([]))
    ok = c.options("/api/review", headers={"origin": "https://fangs-web.onrender.com", "access-control-request-method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "https://fangs-web.onrender.com"
    dev = c.options("/api/review", headers={"origin": "http://localhost:5173", "access-control-request-method": "POST"})
    assert dev.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = c.options("/api/review", headers={"origin": "https://evil.example", "access-control-request-method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


def test_voice_only_reads_server_text_and_caches(make_client):
    tts = []

    def h(req):
        if req.url.host == "api.elevenlabs.io":
            tts.append(json.loads(req.content))
            return httpx.Response(200, content=b"ID3fake")
        return httpx.Response(404)
    c = make_client({"ELEVENLABS_API_KEY": "e", "ELEVENLABS_VOICE_ID": "v1"}, h)
    assert c.post("/api/voice", json={"text": "Read my whole novel aloud for free"}).status_code == 403
    line = c.get("/api/demo/example-weak").json()["voice_line"]
    for _ in range(3):
        r = c.post("/api/voice", json={"text": line})
        assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg"
    assert len(tts) == 1
    assert tts[0]["model_id"] == "eleven_v3" and tts[0]["text"].startswith("[clears throat] [coldly] ")


def test_voice_falls_back_to_multilingual(make_client):
    models = []

    def h(req):
        body = json.loads(req.content)
        models.append(body["model_id"])
        return httpx.Response(500) if body["model_id"] == "eleven_v3" else httpx.Response(200, content=b"ID3")
    c = make_client({"ELEVENLABS_API_KEY": "e"}, h)
    line = c.get("/api/demo/example-strong").json()["voice_line"]
    assert c.post("/api/voice", json={"text": line}).status_code == 200
    assert models == ["eleven_v3", "eleven_multilingual_v2"]


def test_voice_without_key_says_so(make_client):
    c = make_client({})
    line = c.get("/api/demo/example-strong").json()["voice_line"]
    r = c.post("/api/voice", json={"text": line})
    assert r.status_code == 503 and r.json()["fallback"] == "browser"


def test_email_mode(make_client):
    email = "Hi Sam, could you possibly maybe review my PR sometime if you get a chance? Thanks, Jo"

    def h(req):
        return llm_reply({"overall": 55, "criteria": [
            {"name": "Clarity", "score": 6, "verdict": "ok", "evidence_quote": "review my PR"},
            {"name": "Tone", "score": 5, "verdict": "meek", "evidence_quote": "could you possibly maybe"},
            {"name": "The ask", "score": 4, "verdict": "no deadline", "evidence_quote": "sometime if you get a chance"},
            {"name": "Length", "score": 9, "verdict": "short", "evidence_quote": "Thanks, Jo"}],
            "top_fixes": ["Name the PR.", "Give a deadline.", "Drop 'possibly maybe'."],
            "better_subject": "Review PR #42 by Thursday?", "rewrite": "Hi Sam, could you review PR #42 by Thursday? Thanks, Jo",
            "count_says": "Grovelling is not a strategy, mortal."})
    c = make_client(LIVE, h)
    v = c.post("/api/review", json={"mode": "email", "submission_text": email, "context": "to my tech lead"}).json()["verdict"]
    assert v["mode"] == "email" and [x["name"] for x in v["criteria"]] == ["Clarity", "Tone", "The ask", "Length"]
    assert all(x["supported"] for x in v["criteria"])
    assert v["rewrite"].startswith("Hi Sam") and v["expression"] == "grudging"


def test_idea_mode_keeps_only_real_competitors(make_client):
    calls: list = []
    base = world(calls)

    def h(req):
        if str(req.url).endswith("/chat/completions") and "Judge this hackathon IDEA" in req.content.decode():
            return llm_reply({"overall": 62, "criteria": [{"name": n, "score": 6, "verdict": "v", "evidence_quote": "a vampire that judges"} for n in range(3)],
                              "competitors": [{"title": "made up", "url": "https://dev.to/nobody/fake", "why_close": "x"},
                                              {"title": "First", "url": "https://dev.to/w1/first", "why_close": "also judges"}],
                              "top_fixes": ["a", "b", "c"], "better_title": "Fangs", "count_says": "Hm."})
        return base(req)
    c = make_client(LIVE, h)
    v = c.post("/api/review", json={"mode": "idea", "submission_text": "a vampire that judges hackathon posts",
                                    "hackathon_url": "https://dev.to/devteam/the-challenge", "winners_url": "https://dev.to/devteam/winners"}).json()["verdict"]
    assert [x["url"] for x in v["competitors"]] == ["https://dev.to/w1/first"]


def test_backtest_entry_is_blind(make_client):
    calls: list = []
    c = make_client(LIVE, world(calls))
    urls = ["https://dev.to/jane/my-notes-app", "https://dev.to/w1/first"]
    r = c.post("/api/backtest/review", json={**REVIEW, "exclude_urls": urls})
    assert r.status_code == 200, r.text
    pat = [p for p in calls if "These posts WON" in p]
    assert pat and all("w1/first" not in p and "jane/my-notes-app" not in p for p in pat)
    assert r.json()["verdict"]["patterns_blind"] is True
    s = c.post("/api/backtest/score", json={"results": [{"url": urls[0], "overall": 80}, {"url": urls[1], "overall": 20}],
                                            "winners": [urls[1]], "top_n": 1}).json()
    assert s["winners_in_top_n"] == 0 and s["avg_winner"] == 20


def test_judge_screen_identifies_then_judges(make_client):
    seen = []

    def h(req):
        if str(req.url).endswith("/chat/completions"):
            msg = json.loads(req.content)["messages"][0]["content"]
            if isinstance(msg, list):
                seen.append(msg[1]["image_url"]["url"][:30])
                return llm_reply({"kind": "email", "title": "Quick favour", "visible_text": "Hi Sam, please review PR 42 by Friday. Jo",
                                  "challenge_name": None, "challenge_url": None, "submission_url": None})
            return llm_reply({"overall": 70, "criteria": [{"name": n, "score": 7, "verdict": "v", "evidence_quote": "please review PR 42"} for n in "abcd"],
                              "top_fixes": ["1", "2", "3"], "better_subject": "s", "rewrite": "r", "count_says": "Acceptable."})
        return httpx.Response(404)
    c = make_client(LIVE, h)
    r = c.post("/api/judge-screen", json={"image": "data:image/jpeg;base64,/9j/4AAQSkZJRg=="})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["seen"]["kind"] == "email" and out["verdict"]["mode"] == "email"
    assert seen and seen[0].startswith("data:image/jpeg")
    assert c.post("/api/judge-screen", json={"image": "not an image"}).status_code == 400


def test_cors_allows_the_render_static_site_even_without_web_origin(make_client):
    c = make_client({})  # WEB_ORIGIN not set, as when the Blueprint link never resolved
    for origin in ("https://fangs-web.onrender.com", "https://fangs-web-x7k2.onrender.com"):
        r = c.options("/api/case/stream", headers={"origin": origin, "access-control-request-method": "POST",
                                                   "access-control-request-headers": "content-type"})
        assert r.status_code == 200 and r.headers.get("access-control-allow-origin") == origin
    for origin in ("https://fangs-web.onrender.com.evil.example", "https://evil-fangs-web.onrender.com", "http://fangs-web.onrender.com"):
        r = c.options("/api/case/stream", headers={"origin": origin, "access-control-request-method": "POST"})
        assert "access-control-allow-origin" not in r.headers


def test_bare_render_service_name_becomes_the_public_origin(make_client):
    from app.config import load_settings
    assert load_settings({"WEB_ORIGIN": "fangs-web"}).web_origin == "https://fangs-web.onrender.com"
    assert load_settings({"WEB_ORIGIN": "fangs-web.onrender.com"}).web_origin == "https://fangs-web.onrender.com"
    assert load_settings({"WEB_ORIGIN": "https://my.site"}).web_origin == "https://my.site"

import json

import httpx
import pytest

from app import judge
from app.judge import winner_links, winners_hint
from tests.conftest import llm_reply

LIVE = {"LLM_API_KEY": "k", "SERPAPI_KEY": "s"}

BRIEF = {
    "name": "Week 3: Slow and Steady", "theme": "Build something lazy with open models", "deadline": "Oct 25",
    "deadline_iso": "2026-10-26T06:59:00+00:00",
    "criteria": [{"name": "Writing Quality", "weight_pct": 50}, {"name": "Creativity", "weight_pct": 50}],
    "prize_categories": ["Best Use of Gemma", "Best Use of Temporal"],
}

ANNOUNCEMENT = """Results! See the [hub](https://dev.to/devteam/hacktoberfest-hub-1e54) and the
[join post](https://dev.to/devteam/join-the-challenge-3iee).
### Overall Winner
{% embed https://dev.to/alice/i-saved-82-percent-a29 %}
### Best Use of Gemma
{% embed https://dev.to/bob/my-lazy-gemma-4l88 %}
{% embed https://dev.to/devteam/join-the-challenge-3iee %}
"""


@pytest.fixture(autouse=True)
def clear_cache():
    judge._CACHE.clear()


def test_winner_links_prefer_embeds_and_skip_the_organiser():
    ann = {"body": ANNOUNCEMENT, "links": []}
    assert winner_links(ann, "https://dev.to/devteam/winners-3e4a", set()) == [
        "https://dev.to/alice/i-saved-82-percent-a29", "https://dev.to/bob/my-lazy-gemma-4l88"]
    assert winner_links(ann, "https://dev.to/devteam/winners-3e4a", {"https://dev.to/alice/i-saved-82-percent-a29"}) == [
        "https://dev.to/bob/my-lazy-gemma-4l88"]


def test_winners_hint_in_an_announcement():
    body = "Winners announced! {% embed https://dev.to/devteam/congrats-to-week-3-slow-and-steady-winners-3e4a %}"
    assert winners_hint(body, "https://dev.to/devteam/join-3iee").endswith("winners-3e4a")
    assert winners_hint("no results yet", None) is None


def world(calls: list, replies: dict):
    """Fake DEV, SerpApi and model. replies: prompt marker -> reply object."""
    def handler(req: httpx.Request) -> httpx.Response:
        path = req.url.path
        if req.url.host == "serpapi.com":
            return httpx.Response(200, json={"organic_results": [{"link": "https://example.com/nope"},
                                                                  {"link": "https://dev.to/devteam/join-the-challenge-3iee"}]})
        if req.url.host == "dev.to":
            if path == "/api/articles/devteam/join-the-challenge-3iee":
                return httpx.Response(200, json={"title": "Join Week 3!", "url": "https://dev.to/devteam/join-the-challenge-3iee",
                                                 "body_markdown": "Judging: writing. Winners: https://dev.to/devteam/week-3-winners-3e4a"})
            if path == "/api/articles/devteam/week-3-winners-3e4a":
                return httpx.Response(200, json={"title": "Winners", "url": "https://dev.to/devteam/week-3-winners-3e4a", "body_markdown": ANNOUNCEMENT})
            if path in ("/api/articles/alice/i-saved-82-percent-a29", "/api/articles/bob/my-lazy-gemma-4l88"):
                return httpx.Response(200, json={"title": "I Saved 82%", "url": "https://dev.to" + path[13:], "body_markdown": "![x](a.png) a measured test"})
            if path == "/api/articles/me/my-entry":
                return httpx.Response(200, json={"title": "My Entry", "url": "https://dev.to/me/my-entry", "body_markdown": "I built a lazy thing."})
        if str(req.url).endswith("/chat/completions"):
            prompt = json.loads(req.content)["messages"][0]["content"]
            calls.append(prompt)
            for marker, reply in replies.items():
                if marker in prompt:
                    return llm_reply(reply)
        return httpx.Response(404)
    return handler


def sse_events(text: str):
    out = []
    for block in text.strip().split("\n\n"):
        head, data = block.split("\n", 1)
        out.append((head[7:], json.loads(data[6:])))
    return out


def test_open_a_case_by_name_searches_then_digs_brief_and_winners(make_client):
    calls: list = []
    c = make_client(LIVE, world(calls, {
        "Extract the facts": {"name": "Week 3", "theme": "lazy", "deadline": "Oct 25", "deadline_iso": "2026-10-25T23:59:00-07:00",
                              "criteria": [{"name": "Writing Quality", "weight": "most heavily", "weight_pct": 60}, {"name": "Creativity", "weight_pct": 40}],
                              "prize_categories": ["Best Use of Gemma"]},
        "These posts WON": {"patterns": ["A measured result in the title", "A video demo"]},
    }))
    r = c.post("/api/case/stream", json={"name": "Hacktoberfest Week 3"})
    events = sse_events(r.text)
    kinds = [e for e, _ in events]
    assert kinds[-1] == "case"
    case = events[-1][1]
    assert case["brief"]["criteria"][0] == {"name": "Writing Quality", "description": "", "weight": "most heavily", "weight_pct": 60}
    assert case["brief"]["deadline_iso"] == "2026-10-25T23:59:00-07:00"
    assert case["patterns"] == ["A measured result in the title", "A video demo"]
    assert [w["url"] for w in case["winners"]] == ["https://dev.to/alice/i-saved-82-percent-a29", "https://dev.to/bob/my-lazy-gemma-4l88"]
    logs = [d["msg"] for e, d in events if e == "log"]
    assert any("Searching" in m for m in logs) and any("results are already in" in m for m in logs)


def test_case_needs_something(make_client):
    c = make_client(LIVE, world([], {}))
    assert c.post("/api/case/stream", json={}).status_code == 400


def test_demo_mode_answers_every_companion_route(make_client):
    c = make_client({})
    events = sse_events(c.post("/api/case/stream", json={"name": "anything"}).text)
    assert events[-1][0] == "case" and events[-1][1]["banner"]
    assert "Writing" in c.post("/api/chat", json={"message": "What does this jury care about most?"}).json()["reply"]
    gen = c.post("/api/ideas", json={"mode": "generate"}).json()
    assert len(gen["ideas"]) == 3 and gen["banner"]
    judged = c.post("/api/ideas", json={"mode": "judge", "ideas": ["my idea", "another"]}).json()
    assert [i["idea"] for i in judged["ideas"]] == ["my idea", "another"]
    d = c.post("/api/debrief", json={"winners_url": "https://dev.to/x/y", "result": "won"}).json()
    assert len(d["debrief"]["lessons"]) == 3 and d["debrief"]["result"] == "won"
    demo = c.get("/api/demo-case").json()
    assert demo["demo"] is True and len(demo["verdicts"]) == 3
    assert c.post("/api/voice", json={"text": demo["verdicts"][2]["voice_line"]}).status_code == 503  # allowed, just no key


def test_chat_strips_thinking_and_keeps_text_out_of_json(make_client):
    calls: list = []
    c = make_client(LIVE, world(calls, {"Ask Fangs": "<thought>they want {a plan}</thought>Fangs: Record the video first, mortal."}))
    r = c.post("/api/chat", json={"message": "What should I build first with 3 hours left?", "context": "Hackathon: Week 3\nDeadline: 3h left",
                                  "history": [{"role": "user", "content": "hi"}, {"role": "fangs", "content": "Speak."}], "tab": "judge"})
    assert r.status_code == 200
    assert r.json()["reply"] == "Record the video first, mortal."
    assert "Deadline: 3h left" in calls[0] and "MORTAL: hi" in calls[0] and "JUDGE tab" in calls[0]


def test_chat_limits(make_client):
    c = make_client({**LIVE, "RATE_CHAT_PER_10M": "1"}, world([], {"Ask Fangs": "Fine."}))
    assert "banner" not in c.post("/api/chat", json={"message": "a"}).json()
    assert "adjourned" in c.post("/api/chat", json={"message": "b"}).json()["banner"]
    assert c.post("/api/chat", json={"message": "x" * 2001}).status_code == 422
    assert c.post("/api/chat", json={"message": "x", "context": "y" * 8001}).status_code == 422


def test_ideas_judge_and_generate(make_client):
    calls: list = []
    c = make_client(LIVE, world(calls, {
        "Judge each of these hackathon ideas": {"ideas": [
            {"overall": 140, "criteria": [{"name": "o", "score": 8, "verdict": "fresh"}], "verdict": "Good.", "how_it_could_win": "Measure it.",
             "partners": ["gemma", "Best Use of Nonsense"]},
            {"overall": 40, "criteria": [], "verdict": "Meh.", "how_it_could_win": "Pivot.", "partners": []}], "best": 1},
        "Suggest 3 ORIGINAL": {"ideas": [{"title": f"Idea {i}", "pitch": "A pitch.", "partners": ["Temporal"]} for i in range(4)], "count_says": "Hm."},
    }))
    j = c.post("/api/ideas", json={"mode": "judge", "brief": BRIEF, "ideas": ["A receipt sloth", "A standup bot"],
                                   "user_context": "Lessons: lead with a number"}).json()
    assert [i["overall"] for i in j["ideas"]] == [100, 40]
    assert j["ideas"][0]["partners"] == ["Best Use of Gemma"]  # only real categories survive
    assert [k["name"] for k in j["ideas"][1]["criteria"]] == ["Originality", "Theme fit", "Buildability before the deadline", "Partner-category fit"]
    assert "lead with a number" in calls[0] and "hours left" in calls[0] or "days left" in calls[0] or "has passed" in calls[0]
    g = c.post("/api/ideas", json={"mode": "generate", "brief": BRIEF, "patterns": ["A video demo"]}).json()
    assert len(g["ideas"]) == 3 and g["ideas"][0]["partners"] == ["Best Use of Temporal"]
    assert "A video demo" in calls[1]
    assert c.post("/api/ideas", json={"mode": "judge", "ideas": [" "]}).status_code == 400


def test_debrief_compares_with_real_winners(make_client):
    calls: list = []
    c = make_client(LIVE, world(calls, {"The results are in": {
        "winners_did": ["A number in the title"], "you_did_well": ["A demo"],
        "lessons": ["Lead with a number", "Open with pain", "Record a video", "extra"], "count_says": "Next time."}}))
    r = c.post("/api/debrief", json={"brief": BRIEF, "submission": {"url": "https://dev.to/me/my-entry", "verdict_summary": "68/100"},
                                     "winners_url": "https://dev.to/devteam/week-3-winners-3e4a", "result": "lost"})
    assert r.status_code == 200, r.text
    d = r.json()["debrief"]
    assert d["lessons"] == ["Lead with a number", "Open with pain", "Record a video"]
    assert [w["url"] for w in d["winners"]] == ["https://dev.to/alice/i-saved-82-percent-a29", "https://dev.to/bob/my-lazy-gemma-4l88"]
    assert "I built a lazy thing" in calls[0] and "did NOT win" in calls[0]
    assert c.post("/api/debrief", json={"result": "lost"}).status_code == 400


def test_review_inside_a_case_skips_the_dig_and_uses_context(make_client):
    calls: list = []
    c = make_client(LIVE, world(calls, {"Judge this hackathon submission": {
        "overall": 70, "criteria": [{"name": "x", "score": 7, "verdict": "ok", "evidence_quote": "I built a lazy thing"}] * 2,
        "why_not_winning": ["a", "b"], "top_fixes": ["1", "2", "3"], "better_title": "t", "better_opening": "o",
        "partner_claims": [], "count_says": "Hm."}}))
    r = c.post("/api/review", json={"submission_url": "https://dev.to/me/my-entry", "brief": BRIEF,
                                    "patterns": ["A video demo"], "user_context": "Chosen idea: receipts"})
    assert r.status_code == 200, r.text
    assert len(calls) == 1  # no brief extraction, no patterns call
    assert "Chosen idea: receipts" in calls[0] and "A video demo" in calls[0]
    assert r.json()["verdict"]["criteria"][0]["supported"] is True
    assert any("Using the case file" in l for l in r.json()["logs"])


def test_pitch_mode(make_client):
    calls: list = []
    c = make_client(LIVE, world(calls, {"hackathon pitch": {
        "overall": 60, "criteria": [{"name": n, "score": 6, "verdict": "v", "evidence_quote": "files my receipts"} for n in "abcd"],
        "top_fixes": ["1", "2", "3"], "better_subject": "47 minutes to 4", "rewrite": "Better pitch.", "count_says": "Hm."}}))
    v = c.post("/api/review", json={"mode": "pitch", "submission_text": "A local model files my receipts.", "brief": BRIEF}).json()["verdict"]
    assert v["mode"] == "pitch" and [k["name"] for k in v["criteria"]] == ["Hook", "Clarity", "Fit to the brief", "Proof"]
    assert "Week 3: Slow and Steady" in calls[0]


def test_repo_url_alongside_a_post(make_client):
    seen = []

    def h(req):
        seen.append(str(req.url))
        if req.url.host == "dev.to":
            return httpx.Response(200, json={"title": "P", "body_markdown": "post text here", "url": "https://dev.to/me/p"})
        if req.url.host == "api.github.com":
            return httpx.Response(404)
        return llm_reply({"overall": 50, "criteria": [{"name": "x", "score": 5, "verdict": "v", "evidence_quote": ""}] * 2,
                          "why_not_winning": ["a"], "top_fixes": ["1", "2", "3"], "count_says": "Hm."})
    c = make_client(LIVE, h)
    r = c.post("/api/review", json={"submission_url": "https://dev.to/me/p", "repo_url": "https://github.com/me/thing", "brief": BRIEF})
    assert r.status_code == 200
    assert any("api.github.com/repos/me/thing" in u for u in seen)
    assert c.post("/api/review", json={"submission_url": "https://dev.to/me/p", "repo_url": "https://gitlab.com/x/y"}).status_code == 422

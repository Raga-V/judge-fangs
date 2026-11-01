from app.checks import claimed_partners, partner_from_category, post_facts, quote_in_text, run_checks, scan_partner
from tests.conftest import load_fixture

POST = """# I Cut Triage Time by 41%

![demo gif](https://example.com/demo.gif)

Try it live: [live demo](https://triage.onrender.com). Code: https://github.com/someone/triage

{% embed https://www.youtube.com/watch?v=abc123 %}

Every model call is a **gen_ai.chat** span, so you can see the retries.

## Why open source matters

Because I said so.
"""


def test_post_facts():
    f = post_facts("I Cut Triage Time by 41%", POST)
    assert f["title_has_number"] is True
    assert f["images"] == 1
    assert f["videos"] == 1
    assert f["has_demo_link"] is True
    assert f["has_repo_link"] is True
    assert f["has_open_innovation_section"] is True
    assert f["reading_time_min"] == 1
    assert 20 < f["word_count"] < 60
    bare = post_facts("My Submission", "Just words here.")
    assert bare["title_has_number"] is False and bare["has_demo_link"] is False and bare["images"] == 0
    assert post_facts("Seven Days of Bugs", "")["title_has_number"] is True


def test_quote_check_accepts_real_quotes_only():
    assert quote_in_text("Every model call is a gen_ai.chat span", POST)  # markdown bold ignored
    assert quote_in_text("every MODEL call is a   gen_ai.chat span, so you can see the retries", POST)
    assert quote_in_text("“Try it live: live demo”", POST)  # smart quotes, link text
    assert quote_in_text("Every model call is ... you can see the retries", POST)  # ellipsis joins exact parts
    assert not quote_in_text("Every model call is traced in Sentry", POST)  # invented
    assert not quote_in_text("the retries ... Every model call", POST)  # wrong order
    assert not quote_in_text("span", POST)  # too short to count as evidence
    assert not quote_in_text("", POST)


def test_partner_from_category():
    assert partner_from_category("Best Use of Sentry") == "Sentry"
    assert partner_from_category("Best use of ElevenLabs Voice") == "ElevenLabs"
    assert partner_from_category("Best Use of TabPFN") == "TabPFN"
    assert partner_from_category("Overall Winner") is None
    assert partner_from_category("Honorable Mentions") is None


def test_claimed_partners_ignore_pasted_prize_lists():
    text = "Prize categories: Best Use of Sentry, Best Use of Render, Best Use of ElevenLabs.\nI wired Sentry into every call."
    assert claimed_partners(text, []) == [{"partner": "Sentry", "claim": "Best Use of Sentry"}]
    assert claimed_partners("My app speaks with ElevenLabs.", ["Best Use of ElevenLabs", "Overall"]) == [
        {"partner": "ElevenLabs", "claim": "Best Use of ElevenLabs"}]
    assert claimed_partners("I render pages quickly. Best Use of Render", []) == []


def test_scanner_finds_code_evidence():
    repo = load_fixture("repo_sentry.json")
    s = scan_partner("Sentry", repo)
    assert s["status"] == "backed"
    assert any("dependency @sentry/node" in e for e in s["evidence"])
    assert any("import of @sentry/node" in e for e in s["evidence"])
    assert any("SENTRY_DSN" in e for e in s["evidence"])
    e = scan_partner("ElevenLabs", repo)
    assert e["status"] == "backed"
    assert any("api.elevenlabs.io" in x or "ELEVENLABS_API_KEY" in x for x in e["evidence"])
    assert scan_partner("Render", repo)["status"] == "backed"  # render.yaml file


def test_scanner_mentioned_vs_not_found():
    repo = load_fixture("repo_python.json")
    assert scan_partner("MongoDB", repo)["status"] == "backed"  # pymongo + MONGODB_URI
    assert scan_partner("Sentry", repo)["status"] == "mentioned"  # only the README and a comment
    assert scan_partner("Auth0", repo)["status"] == "not_found"
    assert scan_partner("Sentry", None, "I used Sentry")["status"] == "no_repo"


def test_unknown_partner_gets_generic_signals():
    repo = {"manifests": {"package.json": '{"dependencies": {"tabpfn-client": "1"}}'}, "files": {}, "paths": []}
    assert scan_partner("TabPFN", repo)["status"] == "backed"


def test_run_checks_combines_everything():
    repo = load_fixture("repo_python.json")
    out = run_checks({"title": "Notes", "body": "Built with MongoDB and Sentry. Best Use of Sentry"}, repo, ["Best Use of MongoDB", "Best Use of Sentry"])
    statuses = {p["partner"]: p["status"] for p in out["partners"]}
    assert statuses == {"MongoDB": "backed", "Sentry": "mentioned"}
    assert out["facts"]["repo_commits"] == 4 and out["facts"]["repo_has_ci"] is False

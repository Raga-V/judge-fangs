import datetime as dt

from app.backtest import score_backtest
from app.limits import DailyCap, RateLimiter


def test_rate_limiter_sliding_window():
    t = [0.0]
    rl = RateLimiter({"review": 2}, window=600, now=lambda: t[0])
    assert rl.take("review", "a")[0] and rl.take("review", "a")[0]
    ok, retry = rl.take("review", "a")
    assert not ok and retry == 600
    assert rl.take("review", "b")[0]
    assert rl.take("other", "a")[0]
    t[0] = 601
    assert rl.take("review", "a")[0]


def test_daily_cap_resets_at_utc_midnight():
    t = [dt.datetime(2026, 10, 31, 23, 59, tzinfo=dt.timezone.utc).timestamp()]
    cap = DailyCap({"review": 1}, now=lambda: t[0])
    assert not cap.reached("review")
    cap.add("review")
    assert cap.reached("review")
    t[0] += 120
    assert not cap.reached("review")


def test_backtest_scoring_is_blind_until_labels_arrive():
    results = [
        {"url": "https://dev.to/a/one", "title": "One", "overall": 91},
        {"url": "https://dev.to/b/two", "title": "Two", "overall": 40},
        {"url": "https://dev.to/c/three", "title": "Three", "overall": 77},
        {"url": "https://dev.to/d/four", "title": "Four", "overall": 65},
        {"url": "https://dev.to/e/five", "title": "Five", "overall": None},
    ]
    out = score_backtest(results, ["https://dev.to/A/one/", "https://dev.to/d/four", "https://dev.to/z/missing"], top_n=2)
    assert [r["title"] for r in out["ranked"]] == ["One", "Three", "Four", "Two"]
    assert out["winners_total"] == 2
    assert out["winners_in_top_n"] == 1
    assert out["precision_at_n"] == 0.5
    assert out["avg_winner"] == 78.0
    assert out["avg_non_winner"] == 58.5
    assert out["unmatched_winner_urls"] == ["https://dev.to/z/missing"]
    none = score_backtest(results, [], top_n=3)
    assert none["winners_total"] == 0 and none["avg_winner"] is None

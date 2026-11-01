"""Backtest scoring. Blind by design: the true winner labels are only used here,
after every entry has been judged."""
from __future__ import annotations

from .fetchers import normalize_url


def score_backtest(results: list[dict], winner_urls: list[str], top_n: int) -> dict:
    winners = {normalize_url(u) for u in winner_urls if u and u.strip()}
    ranked = sorted((r for r in results if isinstance(r.get("overall"), (int, float))), key=lambda r: -r["overall"])
    rows = []
    for i, r in enumerate(ranked, 1):
        rows.append({**r, "rank": i, "is_winner": normalize_url(r.get("url") or "") in winners})
    n = max(1, min(int(top_n or 1), len(rows) or 1))
    win_scores = [r["overall"] for r in rows if r["is_winner"]]
    other_scores = [r["overall"] for r in rows if not r["is_winner"]]
    in_top = sum(1 for r in rows[:n] if r["is_winner"])
    avg = lambda xs: round(sum(xs) / len(xs), 1) if xs else None
    return {
        "ranked": rows,
        "top_n": n,
        "winners_total": len(win_scores),
        "winners_in_top_n": in_top,
        "precision_at_n": round(in_top / n, 2) if rows else None,
        "avg_winner": avg(win_scores),
        "avg_non_winner": avg(other_scores),
        "unmatched_winner_urls": sorted(winners - {normalize_url(r.get("url") or "") for r in rows}),
    }

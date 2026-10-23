"""Wildcards: fragility, disagreement, blind-vs-named memorisation and narrative crowding."""
from __future__ import annotations

from statistics import mean

from .aggregate import aggregate
from .forecasters import Vote


def leave_one_out(votes: list[Vote], records: dict | None = None, move: float = 0.05) -> dict:
    """Share of single-forecaster removals that flip the side of 0.5 or move p by > `move`."""
    base = aggregate(votes, records)
    if base["abstain"]:
        return {"robustness": None, "fragile": True, "flips": 0, "checked": 0}
    live = [i for i, v in enumerate(votes) if not v.abstain]
    flips = 0
    for i in live:
        alt = aggregate([v for j, v in enumerate(votes) if j != i], records)
        if alt["abstain"] or (alt["p"] - 0.5) * (base["p"] - 0.5) < 0 or abs(alt["p"] - base["p"]) > move:
            flips += 1
    score = 1 - flips / len(live) if live else None
    return {"robustness": score, "fragile": score is not None and score < 0.5, "flips": flips, "checked": len(live)}


def memorisation_gap(blind: list[Vote], named: list[Vote]) -> dict:
    """Named-vs-blind disagreement per forecaster: large gaps suggest retrieval, not reasoning."""
    named_by = {v.forecaster: v for v in named}
    gaps = {v.forecaster: abs(v.p - named_by[v.forecaster].p) for v in blind
            if not v.abstain and v.forecaster in named_by and not named_by[v.forecaster].abstain}
    return {"mean_gap": mean(gaps.values()) if gaps else None, "per_forecaster": gaps,
            "suspect": [k for k, g in gaps.items() if g >= 0.1]}


def narrative_crowding(votes: list[Vote], headline_tones: list[float]) -> dict:
    """Convergence of forecasters and news on one story. Tested as a volatility signal first."""
    live = [v.p for v in votes if not v.abstain and v.p is not None]
    if len(live) < 3:
        return {"crowding": None}
    side = 1 if mean(live) >= 0.5 else -1
    agree = sum(1 for p in live if (p - 0.5) * side > 0.02) / len(live)
    tone = [t for t in headline_tones if t is not None]
    tone_agree = sum(1 for t in tone if t * side > 0.1) / len(tone) if tone else 0.0
    score = 0.6 * agree + 0.4 * tone_agree
    return {"crowding": score, "label": "CROWDED" if score >= 0.8 else "NORMAL",
            "note": "hypothesis: crowding precedes higher realised volatility; pre-registered, unproven"}

"""Listwise sector tournaments: ask "which stock?", not "will the market rise?".

Small same-sector sets are ranked by a (blind) ranker; a Plackett-Luce model turns the
partial rankings into one cross-sectional strength per stock. Ranking within a sector
removes most market beta, the error the archival counter-trend guardrail had to patch.
"""
from __future__ import annotations

import json
import random
from typing import Callable

from . import scoring

Ranker = Callable[[list[str]], list[str]]   # labels in, best-to-worst labels out

RANK_SYSTEM = (
    "Rank the anonymous companies below from MOST to LEAST likely to outperform their sector over "
    "the next {horizon} sessions, using only the evidence. Return ONLY JSON: {{\"ranking\": [labels]}} "
    "containing every label exactly once.")


def make_sets(symbols: list[str], size: int = 6, rounds: int = 3, seed: int = 0) -> list[list[str]]:
    """Each round partitions the sector into shuffled sets so every stock is ranked `rounds` times."""
    rng = random.Random(seed)
    sets = []
    for _ in range(rounds):
        names = symbols[:]
        rng.shuffle(names)
        for i in range(0, len(names), size):
            chunk = names[i:i + size]
            if len(chunk) >= 2:
                sets.append(chunk)
    return sets


def plackett_luce(rankings: list[list[str]], iters: int = 200, tol: float = 1e-9) -> dict[str, float]:
    """Hunter (2004) MM estimator. Strengths are normalised to mean 1."""
    items = sorted({x for r in rankings for x in r})
    if not items:
        return {}
    w = {x: 1.0 for x in items}
    wins = {x: 0 for x in items}
    for r in rankings:
        for x in r[:-1]:
            wins[x] += 1
    for _ in range(iters):
        denom = {x: 0.0 for x in items}
        for r in rankings:
            for j in range(len(r) - 1):
                total = sum(w[x] for x in r[j:])
                for x in r[j:]:
                    denom[x] += 1 / total
        new = {x: (wins[x] + 0.1) / (denom[x] + 0.1) for x in items}   # light prior keeps last-place finite
        scale = len(items) / sum(new.values())
        new = {x: v * scale for x, v in new.items()}
        if max(abs(new[x] - w[x]) for x in items) < tol:
            w = new
            break
        w = new
    return w


def to_probability(strengths: dict[str, float], spread: float = 0.15) -> dict[str, float]:
    """Map rank percentile to P(outperform sector) in [0.5-spread, 0.5+spread]."""
    names = sorted(strengths, key=strengths.get)
    if len(names) == 1:
        return {names[0]: 0.5}
    return {x: 0.5 - spread + 2 * spread * i / (len(names) - 1) for i, x in enumerate(names)}


def llm_ranker(complete: Callable[[str, str], str], blocks: dict[str, str], horizon: int) -> Ranker:
    """Ranker over blind evidence blocks keyed by symbol; invalid output returns None."""
    def rank(symbols: list[str]) -> list[str] | None:
        labels = {f"C{i + 1}": s for i, s in enumerate(symbols)}
        user = "\n\n".join(f"[{label}]\n{blocks[s]}" for label, s in labels.items())
        try:
            order = json.loads(complete(RANK_SYSTEM.format(horizon=horizon), user))["ranking"]
            if sorted(order) != sorted(labels):
                return None
            return [labels[label] for label in order]
        except Exception:  # noqa: BLE001
            return None
    return rank


def run(symbols: list[str], ranker: Ranker, size: int = 6, rounds: int = 3, seed: int = 0) -> dict:
    rankings, failed = [], 0
    for chunk in make_sets(symbols, size, rounds, seed):
        order = ranker(chunk)
        if order is None:
            failed += 1
        else:
            rankings.append(order)
    strengths = plackett_luce(rankings)
    return {"strengths": strengths, "p_outperform_sector": to_probability(strengths) if strengths else {},
            "sets": len(rankings), "failed_sets": failed}


def daily_ic(strengths: dict[str, float], realised_excess: dict[str, float]) -> float | None:
    names = [x for x in strengths if x in realised_excess]
    return scoring.spearman([strengths[x] for x in names], [realised_excess[x] for x in names])

"""Code-owned aggregation: debias, weight by track record, median in logit space, extremize."""
from __future__ import annotations

import math
from statistics import mean

from .forecasters import Vote
from .schema import Contribution

FLOOR_WEIGHT = 0.25          # unproven forecasters still count a little
MAX_EXTREMIZE = 1.5


def logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def track_record(history: dict[str, list[tuple[float, int]]]) -> dict[str, dict]:
    """Per-forecaster bias and Brier skill vs climatology from settled (p, y) pairs."""
    out = {}
    for name, pairs in history.items():
        if not pairs:
            continue
        brier = mean((p - y) ** 2 for p, y in pairs)
        clim = mean((0.5 - y) ** 2 for _, y in pairs)
        out[name] = {"n": len(pairs), "bias": mean(p for p, _ in pairs) - mean(y for _, y in pairs),
                     "skill": 1 - brier / clim if clim else 0.0}
    return out


def weight(stats: dict | None, min_n: int = 30) -> float:
    if not stats or stats["n"] < min_n:
        return FLOOR_WEIGHT
    # Skill <= 0 earns only the floor; positive skill scales up with evidence.
    return FLOOR_WEIGHT + max(0.0, stats["skill"]) * 10 * min(1.0, stats["n"] / 200)


def debias(p: float, stats: dict | None, min_n: int = 30) -> float:
    """Removes measured acquiescence bias (LLMs tend to answer above 0.5)."""
    if not stats or stats["n"] < min_n:
        return p
    return min(max(p - stats["bias"], 0.01), 0.99)


def weighted_median(values: list[float], weights: list[float]) -> float:
    pairs = sorted(zip(values, weights))
    half, acc = sum(weights) / 2, 0.0
    for value, w in pairs:
        acc += w
        if acc >= half:
            return value
    return pairs[-1][0]


def aggregate(votes: list[Vote], records: dict[str, dict] | None = None, min_votes: int = 3) -> dict:
    records = records or {}
    live = [v for v in votes if not v.abstain and v.p is not None]
    if len(live) < min_votes:
        return {"p": None, "abstain": True, "reason": f"only {len(live)} of {len(votes)} forecasters answered",
                "contributions": [], "disagreement": None}
    contribs = []
    for v in live:
        stats = records.get(v.forecaster)
        contribs.append(Contribution(v.forecaster, debias(v.p, stats), weight(stats), raw_p=v.p, note=v.reason[:120]))
    xs = [logit(c.p) for c in contribs]
    ws = [c.weight for c in contribs]
    center = weighted_median(xs, ws)
    probs = [c.p for c in contribs]
    disagreement = math.sqrt(sum(w * (p - mean(probs)) ** 2 for p, w in zip(probs, ws)) / sum(ws))
    # Extremize only when several independent, track-recorded forecasters agree.
    proven = sum(1 for c in contribs if c.weight > FLOOR_WEIGHT)
    alpha = min(MAX_EXTREMIZE, 1 + 0.1 * proven) if disagreement < 0.08 else 1.0
    return {"p": sigmoid(alpha * center), "abstain": False, "reason": "", "contributions": contribs,
            "disagreement": disagreement, "extremize": alpha}

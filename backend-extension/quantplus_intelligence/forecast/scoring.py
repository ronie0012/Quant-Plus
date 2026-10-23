"""Proper scoring rules. Binary accuracy on a dozen cases cannot separate skill from luck."""
from __future__ import annotations

import math
from statistics import mean, pstdev

EPS = 1e-6


def brier(p: float, y: int) -> float:
    return (p - y) ** 2


def log_loss(p: float, y: int) -> float:
    p = min(max(p, EPS), 1 - EPS)
    return -math.log(p if y else 1 - p)


def pinball(q: float, tau: float, y: float) -> float:
    diff = y - q
    return max(tau * diff, (tau - 1) * diff)


def crps_from_quantiles(quantiles: dict, y: float) -> float:
    """Quantile-score approximation of CRPS: twice the mean pinball loss."""
    return 2 * mean(pinball(q, float(tau), y) for tau, q in quantiles.items())


def mean_score(fn, pairs) -> float | None:
    pairs = list(pairs)
    return mean(fn(p, y) for p, y in pairs) if pairs else None


def skill(model: float | None, reference: float | None) -> float | None:
    """1 - model/reference: positive means better than the baseline, 0 means equal."""
    if model is None or not reference:
        return None
    return 1 - model / reference


def reliability(pairs, bins: int = 10) -> list[dict]:
    """Calibration table: mean forecast vs observed frequency per probability bin."""
    table = [[] for _ in range(bins)]
    for p, y in pairs:
        table[min(int(p * bins), bins - 1)].append((p, y))
    return [{"bin": i, "n": len(rows), "mean_p": mean(p for p, _ in rows), "observed": mean(y for _, y in rows)}
            for i, rows in enumerate(table) if rows]


def coverage_curve(pairs, levels=(0.25, 0.5, 0.75, 1.0)) -> list[dict]:
    """Selective prediction: Brier when answering only the most confident fraction."""
    ranked = sorted(pairs, key=lambda py: -abs(py[0] - 0.5))
    out = []
    for level in levels:
        kept = ranked[:max(1, round(len(ranked) * level))] if ranked else []
        out.append({"coverage": level, "n": len(kept), "brier": mean_score(brier, kept)})
    return out


def _ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2
        i = j + 1
    return ranks


def spearman(x: list[float], y: list[float]) -> float | None:
    if len(x) != len(y) or len(x) < 3:
        return None
    rx, ry = _ranks(x), _ranks(y)
    mx, my = mean(rx), mean(ry)
    sx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    sy = math.sqrt(sum((b - my) ** 2 for b in ry))
    if not sx or not sy:
        return None
    return sum((a - mx) * (b - my) for a, b in zip(rx, ry)) / (sx * sy)


def ic_summary(daily_ic: list[float]) -> dict:
    """Mean daily rank IC and its t-stat; t > 2 is the P1 advance gate."""
    values = [v for v in daily_ic if v is not None]
    if len(values) < 2:
        return {"days": len(values), "mean_ic": values[0] if values else None, "t_stat": None}
    sd = pstdev(values)
    t = mean(values) / (sd / math.sqrt(len(values) - 1)) if sd else None
    return {"days": len(values), "mean_ic": mean(values), "ic_sd": sd, "t_stat": t}


def days_to_significance(ic: float, ic_sd: float, t: float = 2.0) -> int | None:
    """Trading days needed for a true IC to reach a given t-stat."""
    if ic <= 0 or ic_sd <= 0:
        return None
    return math.ceil((t * ic_sd / ic) ** 2)


def interval_coverage(rows) -> float | None:
    """Share of outcomes inside [low, high]; rows are (low, high, y)."""
    rows = list(rows)
    return mean(1.0 if lo <= y <= hi else 0.0 for lo, hi, y in rows) if rows else None

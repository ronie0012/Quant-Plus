"""Isotonic calibration and split-conformal intervals, fitted on forward-settled labels only."""
from __future__ import annotations

import bisect
import math

MIN_LABELS = 50


class Isotonic:
    """Pool-adjacent-violators fit; identity until enough labels exist (never trains on noise)."""

    def __init__(self, min_labels: int = MIN_LABELS):
        self.min_labels = min_labels
        self.xs: list[float] = []
        self.ys: list[float] = []

    @property
    def fitted(self) -> bool:
        return bool(self.xs)

    def fit(self, pairs) -> "Isotonic":
        pairs = sorted((float(p), float(y)) for p, y in pairs)
        if len(pairs) < self.min_labels:
            self.xs, self.ys = [], []
            return self
        blocks = [[p, y, 1.0] for p, y in pairs]   # [sum_x, sum_y, weight]
        merged: list[list[float]] = []
        for block in blocks:
            merged.append(block)
            while len(merged) > 1 and merged[-2][1] / merged[-2][2] > merged[-1][1] / merged[-1][2]:
                b = merged.pop()
                merged[-1] = [merged[-1][0] + b[0], merged[-1][1] + b[1], merged[-1][2] + b[2]]
        self.xs = [b[0] / b[2] for b in merged]
        self.ys = [b[1] / b[2] for b in merged]
        return self

    def __call__(self, p: float) -> float:
        if not self.fitted:
            return p
        if p <= self.xs[0]:
            return self.ys[0]
        if p >= self.xs[-1]:
            return self.ys[-1]
        i = bisect.bisect_right(self.xs, p)
        x0, x1, y0, y1 = self.xs[i - 1], self.xs[i], self.ys[i - 1], self.ys[i]
        return y0 + (y1 - y0) * (p - x0) / (x1 - x0) if x1 > x0 else y0


def conformal_margin(rows, coverage: float = 0.8, min_rows: int = 30) -> float | None:
    """Split-conformal widening for [low, high] intervals; rows are (low, high, y).

    Returns q_hat to add to both ends so that empirical coverage is >= nominal under
    exchangeability. None (no adjustment, flagged uncalibrated) below min_rows.
    """
    scores = sorted(max(lo - y, y - hi) for lo, hi, y in rows)
    n = len(scores)
    if n < min_rows:
        return None
    k = min(n - 1, math.ceil((n + 1) * coverage) - 1)
    return scores[k]

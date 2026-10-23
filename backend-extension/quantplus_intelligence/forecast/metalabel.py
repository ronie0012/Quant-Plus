"""Meta-labeling over the deterministic core (López de Prado).

The core proposes trades; a small logistic model estimates P(core trade succeeds) from
extracted features and may only shrink size within [0, core]. It never sets direction
and refuses to act before MIN_LABELS forward-settled outcomes exist.
"""
from __future__ import annotations

import math
from statistics import mean, pstdev

MIN_LABELS = 50
P_ZERO, P_FULL = 0.45, 0.60     # below P_ZERO -> no position; above P_FULL -> full core size


class MetaLabeler:
    def __init__(self, features: list[str], l2: float = 1.0):
        self.features = features
        self.l2 = l2
        self.w: list[float] | None = None
        self.mu: list[float] = []
        self.sd: list[float] = []

    def _x(self, row: dict) -> list[float]:
        return [1.0] + [((row.get(f) or 0.0) - m) / s for f, m, s in zip(self.features, self.mu, self.sd)]

    def fit(self, rows: list[dict], labels: list[int], epochs: int = 400, lr: float = 0.1) -> "MetaLabeler":
        if len(rows) < MIN_LABELS:
            self.w = None
            return self
        cols = [[r.get(f) or 0.0 for r in rows] for f in self.features]
        self.mu = [mean(c) for c in cols]
        self.sd = [pstdev(c) or 1.0 for c in cols]
        X = [self._x(r) for r in rows]
        w = [0.0] * len(X[0])
        n = len(X)
        for _ in range(epochs):
            grad = [0.0] * len(w)
            for x, y in zip(X, labels):
                p = 1 / (1 + math.exp(-max(min(sum(a * b for a, b in zip(w, x)), 30), -30)))
                for j, xj in enumerate(x):
                    grad[j] += (p - y) * xj / n
            for j in range(len(w)):
                grad[j] += (self.l2 * w[j] / n) if j else 0.0
                w[j] -= lr * grad[j]
        self.w = w
        return self

    def proba(self, row: dict) -> float | None:
        if self.w is None:
            return None
        z = sum(a * b for a, b in zip(self.w, self._x(row)))
        return 1 / (1 + math.exp(-max(min(z, 30), -30)))

    def size(self, core_size: float, row: dict) -> dict:
        """Down-only sizing. Untrained -> core size unchanged, flagged."""
        p = self.proba(row)
        if p is None:
            return {"size": core_size, "p_success": None, "status": "untrained: core size unchanged"}
        frac = min(1.0, max(0.0, (p - P_ZERO) / (P_FULL - P_ZERO)))
        return {"size": core_size * frac, "p_success": p, "status": "meta-labelled"}


def compare(rows: list[dict], labels: list[int], pnl: list[float], features: list[str], train_frac: float = 0.6) -> dict:
    """Time-ordered holdout: meta-sized PnL vs core PnL. Promotion needs meta > core."""
    cut = int(len(rows) * train_frac)
    model = MetaLabeler(features).fit(rows[:cut], labels[:cut])
    if model.w is None:
        return {"status": "INSUFFICIENT", "train": cut, "needed": MIN_LABELS}
    core = sum(pnl[cut:])
    meta = sum(model.size(1.0, r)["size"] * x for r, x in zip(rows[cut:], pnl[cut:]))
    return {"status": "PASS" if meta > core else "FAIL", "core_pnl": core, "meta_pnl": meta,
            "test": len(rows) - cut}

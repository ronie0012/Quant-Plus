"""Executable falsifiers: the market breaks theses, not prose.

A falsifier is a tiny machine-checkable rule such as `close < 2810.5`,
`excess_ret_5d <= -0.06` or `event:pledge_create`. Code evaluates them on fresh
snapshots and moves the thesis HEALTHY -> WEAKENED -> BROKEN.
"""
from __future__ import annotations

import operator
import re
from dataclasses import dataclass

OPS = {"<": operator.lt, "<=": operator.le, ">": operator.gt, ">=": operator.ge}
FIELDS = {"close", "excess_ret_5d", "excess_ret_20d", "vol_20d", "vix_pct", "dist_hi20", "dist_lo20", "ret_5d"}
_RULE = re.compile(r"^\s*([a-z_0-9]+)\s*(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)\s*$")


@dataclass(frozen=True)
class Falsifier:
    rule: str
    severity: str = "hard"          # hard -> BROKEN, soft -> WEAKENED
    why: str = ""

    def __post_init__(self):
        if self.severity not in ("hard", "soft"):
            raise ValueError("severity must be hard or soft")
        parse(self.rule)


def parse(rule: str):
    if rule.startswith("event:"):
        kind = rule.split(":", 1)[1]
        from .events import EVENT_TYPES
        if kind not in EVENT_TYPES:
            raise ValueError(f"unknown event type {kind}")
        return ("event", kind)
    m = _RULE.match(rule)
    if not m or m.group(1) not in FIELDS:
        raise ValueError(f"unsupported falsifier: {rule!r}")
    return (m.group(1), m.group(2), float(m.group(3)))


def tripped(f: Falsifier, snapshot: dict, new_events: list[str]) -> bool | None:
    """True/False, or None when the needed observation is missing (never guessed)."""
    spec = parse(f.rule)
    if spec[0] == "event":
        return spec[1] in new_events
    field, op, value = spec
    observed = snapshot.get(field)
    return None if observed is None else OPS[op](observed, value)


def evaluate(falsifiers: list[Falsifier], snapshot: dict, new_events: list[str] | None = None) -> dict:
    new_events = new_events or []
    results = [{"rule": f.rule, "severity": f.severity, "why": f.why, "tripped": tripped(f, snapshot, new_events)}
               for f in falsifiers]
    hard = any(r["tripped"] and r["severity"] == "hard" for r in results)
    soft = any(r["tripped"] and r["severity"] == "soft" for r in results)
    unknown = sum(r["tripped"] is None for r in results)
    status = "BROKEN" if hard else "WEAKENED" if soft else "HEALTHY"
    return {"status": status, "results": results, "unobserved": unknown}


def defaults(p_outperform: float, last_close: float, quantiles: dict, feats: dict, horizon: int) -> list[Falsifier]:
    """Standard falsifiers derived from the card's own numbers."""
    out = []
    if p_outperform >= 0.5:
        floor = round(last_close * (1 + quantiles["0.1"]), 2)
        out.append(Falsifier(f"close < {floor}", "hard", "price below the forecast's own 10th percentile"))
        out.append(Falsifier(f"excess_ret_5d <= {round(-2 * (feats.get('excess_vol_20d') or 0.01) * 5 ** 0.5, 4)}",
                             "soft", "sharp underperformance vs benchmark"))
        out.append(Falsifier("event:pledge_create", "hard", "new promoter pledge"))
    else:
        cap = round(last_close * (1 + quantiles["0.9"]), 2)
        out.append(Falsifier(f"close > {cap}", "hard", "price above the forecast's own 90th percentile"))
        out.append(Falsifier("event:promoter_buy", "soft", "promoter buying contradicts underperformance"))
    out.append(Falsifier("vix_pct >= 0.85", "soft", "volatility regime turned STRESSED"))
    out.append(Falsifier("event:auditor_resign", "hard", "auditor resignation"))
    return out

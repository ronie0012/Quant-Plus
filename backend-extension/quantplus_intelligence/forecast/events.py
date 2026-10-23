"""Event Alpha Library: typed disclosure events and the event studies that admit them.

An event type becomes a forecasting feature only after forward event studies show a
cost-adjusted abnormal return that survives multiple testing. Until then it is context.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from statistics import mean, pstdev

ROUND_TRIP_COST = 0.0021

EVENT_TYPES = {
    "promoter_buy": "Promoter/promoter-group acquisition (SEBI PIT/SAST disclosure)",
    "promoter_sell": "Promoter/promoter-group disposal",
    "insider_buy": "Designated-person acquisition",
    "insider_sell": "Designated-person disposal",
    "pledge_create": "Creation or increase of promoter pledge",
    "pledge_release": "Release/revocation of promoter pledge",
    "bulk_buy": "Bulk or block deal, buy side",
    "bulk_sell": "Bulk or block deal, sell side",
    "auditor_resign": "Resignation of statutory auditor",
    "rating_upgrade": "Credit rating upgrade",
    "rating_downgrade": "Credit rating downgrade",
    "results_scheduled": "Board meeting scheduled to approve results",
    "guidance_raise": "Management raised guidance",
    "guidance_cut": "Management cut guidance",
    "earnings_surprise": "Reported results versus consensus estimate",
}

# Conservative keyword rules; ambiguous text stays unclassified rather than guessed.
_RULES = (
    ("pledge_release", r"\b(release|revocation|invocation released)\b.*\bpledge|\bpledge\b.*\b(release|revoked)"),
    ("pledge_create", r"\b(creation|created|increase)\b.*\bpledge|\bpledge\b.*\b(created|creation)"),
    ("auditor_resign", r"\bresignation of (the )?(statutory )?auditor|\bauditor\b.*\bresign"),
    ("rating_downgrade", r"\b(downgrade|downgraded|revised downward)\b.*\brating|\brating\b.*\bdowngrad"),
    ("rating_upgrade", r"\b(upgrade|upgraded)\b.*\brating|\brating\b.*\bupgrad"),
    ("results_scheduled", r"\bboard meeting\b.*\b(financial results|results)\b"),
    ("promoter_buy", r"\bpromoter\b.*\b(acqui|purchase|bought)"),
    ("promoter_sell", r"\bpromoter\b.*\b(dispos|sale|sold)"),
    ("insider_buy", r"\b(designated person|insider)\b.*\b(acqui|purchase|bought)"),
    ("insider_sell", r"\b(designated person|insider)\b.*\b(dispos|sale|sold)"),
    ("bulk_buy", r"\b(bulk|block) deal\b.*\bbuy"),
    ("bulk_sell", r"\b(bulk|block) deal\b.*\bsell"),
    ("guidance_raise", r"\b(raise[sd]?|upgrade[sd]?|increase[sd]?)\b.*\bguidance"),
    ("guidance_cut", r"\b(cut|lower(ed|s)?|reduce[sd]?)\b.*\bguidance"),
)


def classify(subject: str) -> str | None:
    text = subject.lower()
    hits = [kind for kind, pattern in _RULES if re.search(pattern, text)]
    # Conflicting directions (e.g. buy and sell in one line) are ambiguous: abstain.
    sides = {k.rsplit("_", 1)[0] for k in hits}
    if not hits or len(hits) > 1 and len(sides) < len(hits):
        return None
    return hits[0]


@dataclass(frozen=True)
class Event:
    id: str
    symbol: str
    kind: str
    disclosed_at: str          # first-seen time; never backdated
    facts: dict

    def to_card(self, as_of: str) -> dict:
        from datetime import datetime
        days = (datetime.fromisoformat(as_of) - datetime.fromisoformat(self.disclosed_at)).days
        return {"id": self.id, "kind": self.kind, "days_ago": days, "facts": self.facts}


def in_window(events: list[Event], symbol: str, as_of: str, days: int = 30) -> list[dict]:
    """PIT filter: only events first seen at or before the cutoff, within the lookback."""
    cards = [e.to_card(as_of) for e in events if e.symbol == symbol and e.disclosed_at <= as_of]
    return sorted((c for c in cards if 0 <= c["days_ago"] <= days), key=lambda c: c["days_ago"])


def study(abnormal: dict[str, list[float]], horizons=(1, 5, 20), cost: float = ROUND_TRIP_COST) -> dict:
    """Event study per type. abnormal[kind] holds per-event daily abnormal returns after the event."""
    out = {}
    for kind, rows in abnormal.items():
        res = {"n": len(rows)}
        for h in horizons:
            cars = [sum(r[:h]) for r in rows if len(r) >= h]
            if len(cars) < 2:
                res[f"car_{h}"] = None
                continue
            sd = pstdev(cars)
            m = mean(cars)
            net = abs(m) - cost
            res[f"car_{h}"] = {"mean": m, "net_of_cost": math.copysign(max(net, 0.0), m), "n": len(cars),
                               "t_stat": m / (sd / math.sqrt(len(cars) - 1)) if sd else None}
        out[kind] = res
    return out


def admit(results: dict, horizon: int = 5, min_n: int = 30, alpha_t: float = 2.0, forward_only: bool = True) -> dict:
    """Bonferroni-style gate across all tested types; returns admitted types with direction."""
    tested = [k for k, r in results.items() if r.get(f"car_{horizon}")]
    bar = alpha_t + 0.5 * math.log(max(len(tested), 1))     # higher bar for more simultaneous tests
    admitted = {}
    for kind in tested:
        car = results[kind][f"car_{horizon}"]
        t = car["t_stat"]
        if forward_only and car["n"] >= min_n and t is not None and abs(t) >= bar and car["net_of_cost"] != 0:
            admitted[kind] = {"direction": 1 if car["mean"] > 0 else -1, "t_stat": t, "net_car": car["net_of_cost"]}
    return {"t_bar": bar, "tested": len(tested), "admitted": admitted}


def event_prior(events: list[dict], admitted: dict, scale: float = 0.03) -> float | None:
    """Shift from 0.5 implied by admitted, recent event types; None when nothing admitted applies."""
    shifts = [admitted[e["kind"]]["direction"] * scale * math.exp(-e["days_ago"] / 10)
              for e in events if e["kind"] in admitted]
    return 0.5 + max(-0.15, min(0.15, sum(shifts))) if shifts else None

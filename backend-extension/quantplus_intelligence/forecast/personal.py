"""Personal fit: the same forecast can suit one investor and not another.

Inputs are the user's paper book, profile and order history; output is a next best
action (including "do nothing") with plain reasons. Research-only guidance, never an order.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

PROFILES = {
    "conservative": {"max_position": 0.08, "max_sector": 0.25, "max_vol": 0.022, "min_edge": 0.07},
    "balanced": {"max_position": 0.12, "max_sector": 0.35, "max_vol": 0.030, "min_edge": 0.05},
    "aggressive": {"max_position": 0.18, "max_sector": 0.45, "max_vol": 0.045, "min_edge": 0.03},
}


def portfolio_vol(weights: dict[str, float], vols: dict[str, float], corr: float = 0.35) -> float:
    """Constant-correlation approximation of daily portfolio volatility."""
    names = [n for n in weights if n in vols]
    var = 0.0
    for a in names:
        for b in names:
            rho = 1.0 if a == b else corr
            var += weights[a] * weights[b] * vols[a] * vols[b] * rho
    return math.sqrt(max(var, 0.0))


def _utc(value) -> datetime:
    moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment.astimezone(timezone.utc)


def behaviour_flags(orders: list[dict], feats_at_order: dict[str, dict] | None = None, now: datetime | None = None) -> list[dict]:
    """Chasing, overtrading and disposition-effect signals from the user's own paper orders."""
    now = _utc(now or datetime.now(timezone.utc))
    flags = []
    recent = [o for o in orders if _utc(o["at"]) >= now - timedelta(days=7)]
    if len(recent) >= 15:
        flags.append({"flag": "overtrading", "detail": f"{len(recent)} orders in the last 7 days"})
    feats_at_order = feats_at_order or {}
    chased = [o for o in orders if o["side"] == "buy" and feats_at_order.get(o["id"], {}).get("blowoff_flag")]
    if chased:
        flags.append({"flag": "chasing", "detail": f"{len(chased)} buys right after a blowoff move"})
    closed = [o for o in orders if o["side"] == "sell" and o.get("pnl_pct") is not None]
    wins = [o for o in closed if o["pnl_pct"] > 0]
    losses = [o for o in closed if o["pnl_pct"] < 0]
    if len(closed) >= 6 and wins and losses:
        hold_w = sum(o.get("held_days", 0) for o in wins) / len(wins)
        hold_l = sum(o.get("held_days", 0) for o in losses) / len(losses)
        if hold_l > 1.5 * hold_w:
            flags.append({"flag": "disposition_effect",
                          "detail": f"losers held {hold_l:.0f} days vs winners {hold_w:.0f} days"})
    return flags


def fit(card: dict, symbol_sector: str, symbol_vol: float, book: dict, profile: str = "balanced",
        flags: list[dict] | None = None) -> dict:
    """book = {"equity": float, "positions": {sym: {"value", "sector", "vol"}}}."""
    rules = PROFILES.get(profile, PROFILES["balanced"])
    equity = book.get("equity") or 0.0
    positions = book.get("positions", {})
    reasons, action = [], "watch"
    if card.get("abstain"):
        return {"action": "do nothing", "reasons": [f"the forecast abstained: {card.get('abstain_reason')}"],
                "profile": profile, "authority": "RESEARCH_ONLY"}
    p = card["p_outperform"]
    edge = p - 0.5
    held = positions.get(card["symbol"], {}).get("value", 0.0)
    weight_now = held / equity if equity else 0.0
    sector_w = sum(v["value"] for v in positions.values() if v.get("sector") == symbol_sector) / equity if equity else 0.0
    weights = {k: v["value"] / equity for k, v in positions.items()} if equity else {}
    vols = {k: v.get("vol", 0.02) for k, v in positions.items()}
    before = portfolio_vol(weights, vols)
    trial = dict(weights)
    add = max(0.0, min(rules["max_position"] - weight_now, 0.05))
    trial[card["symbol"]] = weight_now + add
    after = portfolio_vol(trial, {**vols, card["symbol"]: symbol_vol})
    marginal = after - before

    if abs(edge) < rules["min_edge"]:
        action = "do nothing"
        reasons.append(f"edge {edge:+.2f} is below your profile's {rules['min_edge']:.2f} threshold")
    elif edge > 0:
        action = "consider"
        reasons.append(f"{p:.0%} chance of beating the benchmark")
    else:
        action = "reduce" if held else "avoid"
        reasons.append(f"only {p:.0%} chance of beating the benchmark")
    if symbol_vol > rules["max_vol"] and action == "consider":
        action = "watch"
        reasons.append(f"daily volatility {symbol_vol:.1%} exceeds your {rules['max_vol']:.1%} comfort level")
    if weight_now >= rules["max_position"] and action == "consider":
        action = "do nothing"
        reasons.append(f"already {weight_now:.0%} of your book (limit {rules['max_position']:.0%})")
    if sector_w >= rules["max_sector"] and action == "consider":
        action = "watch"
        reasons.append(f"{symbol_sector} is already {sector_w:.0%} of your book")
    for f in flags or []:
        if f["flag"] in ("chasing", "overtrading") and action == "consider":
            reasons.append(f"habit check: {f['detail']}")
    return {"action": action, "reasons": reasons, "profile": profile, "position_weight": weight_now,
            "sector_weight": sector_w, "marginal_daily_vol": marginal, "flags": flags or [],
            "authority": "RESEARCH_ONLY"}

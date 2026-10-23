"""Compose evidence -> crowd -> aggregate -> calibrate -> risk -> falsifiers -> Forecast Card -> ledger."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from . import aggregate as agg, falsifiers, risk
from .calibration import Isotonic, conformal_margin
from .evidence import EvidenceCard, features
from .forecasters import DEFAULT_CROWD, run_crowd
from .ledger import Ledger
from .robustness import leave_one_out
from .schema import ForecastCard, card_from_dict

_ledger: Ledger | None = None


def ledger() -> Ledger:
    global _ledger
    if _ledger is None:
        _ledger = Ledger(os.environ.get("FORECAST_LEDGER_PATH", "data/forecast_ledger.sqlite3"))
    return _ledger


def history_records(book: Ledger, horizon: int) -> tuple[dict, Isotonic, float | None]:
    """Track records, isotonic calibrator and conformal margin from settled forecasts only."""
    rows = [r for r in book.cards(settled=True, limit=100000)
            if r["card"]["horizon"] == horizon and not r["card"]["abstain"]]
    per: dict[str, list] = {}
    for r in rows:
        y = r["outcome"]["outperformed"]
        for c in r["card"]["contributions"]:
            per.setdefault(c["forecaster"], []).append((c["raw_p"] if c["raw_p"] is not None else c["p"], y))
    iso = Isotonic().fit([(r["card"]["p_outperform"], r["outcome"]["outperformed"]) for r in rows])
    margin = conformal_margin([(r["card"]["quantiles"]["0.1"], r["card"]["quantiles"]["0.9"],
                                r["outcome"]["excess_return"]) for r in rows])
    return agg.track_record(per), iso, margin


def build(symbol: str, as_of: str, horizon: int, closes: list[float], bench: list[float],
          complete=None, sector: str = "UNKNOWN", volumes: list[float] | None = None,
          events: list[dict] | None = None, headlines: list[str] | None = None, flows: dict | None = None,
          scheduled_event: bool = False, book: Ledger | None = None, crowd=DEFAULT_CROWD, blind: bool = True) -> dict:
    """Pure composition over already-PIT-filtered inputs. Returns the card plus display extras."""
    book = book or ledger()
    feats = features(closes, bench, volumes=volumes)
    card_in = EvidenceCard(symbol, as_of, sector, feats, events or [], headlines or [], flows or {})
    votes = run_crowd(card_in, horizon, complete, crowd, blind)
    records, iso, margin = history_records(book, horizon)
    combined = agg.aggregate(votes, records)

    excess = [a / b - (c / d) for a, b, c, d in zip(closes[1:], closes, bench[1:], bench)] \
        if len(closes) == len(bench) else []
    daily = risk.ewma_vol(excess[-120:]) or feats.get("excess_vol_20d") or 0.02
    sigma = risk.horizon_vol(daily, horizon)
    quantiles = risk.quantiles(sigma, margin=margin)
    shock = risk.p_event_shock(sigma, scheduled_event)

    if combined["abstain"]:
        card = ForecastCard(symbol, as_of, horizon, "NIFTY50", None, quantiles, sigma, shock, abstain=True,
                            abstain_reason=combined["reason"], blind=blind, evidence_refs=tuple(card_in.refs()))
        return {"card": card, "votes": votes, "calibrated": iso.fitted, "conformal": margin is not None,
                "falsifiers": [], "risk": _risk_block(sigma, closes[-1])}

    p = iso(combined["p"])
    fals = falsifiers.defaults(p, closes[-1], quantiles, feats, horizon)
    loo = leave_one_out(votes, records)
    card = ForecastCard(
        symbol, as_of, horizon, "NIFTY50", round(p, 4), {k: round(v, 5) for k, v in quantiles.items()},
        round(sigma, 5), round(shock, 4), contributions=tuple(combined["contributions"]),
        disagreement=round(combined["disagreement"], 4), robustness=loo["robustness"], blind=blind,
        falsifiers=tuple(f.rule for f in fals), evidence_refs=tuple(card_in.refs()))
    return {"card": card, "votes": votes, "calibrated": iso.fitted, "conformal": margin is not None,
            "falsifiers": [f.__dict__ for f in fals], "risk": _risk_block(sigma, closes[-1]),
            "extremize": combined.get("extremize")}


def _risk_block(sigma: float, last: float) -> dict:
    return {"horizon_sigma": sigma, "p_drawdown_5pct": risk.p_drawdown(sigma, 0.05),
            "p_drawdown_10pct": risk.p_drawdown(sigma, 0.10), "last_close": last}


def view(result: dict, recorded: dict | None = None) -> dict:
    """JSON for the API/UI. Probabilities are labelled uncalibrated until enough labels exist."""
    card = result["card"]
    data = card.to_dict()
    return {**data, "card_id": card.card_id, "votes": [v.__dict__ for v in result["votes"]],
            "calibration": "isotonic" if result["calibrated"] else "uncalibrated (fewer than 50 settled forecasts)",
            "interval": "conformal" if result["conformal"] else "model-based (not yet conformal)",
            "falsifier_details": result["falsifiers"], "risk": result["risk"],
            "ledger": recorded, "generated_at": datetime.now(timezone.utc).isoformat()}


def row_view(row: dict, settled_count: int | None = None) -> dict:
    """One display shape for every ledger row: card, lock metadata, risk block and calibration state."""
    card = row["card"]
    sigma = card.get("vol_forecast") or 0.0
    return {**card, "matures_on": row["matures_on"], "recorded_at": row["recorded_at"], "hash": row["hash"],
            "settled_at": row["settled_at"], "outcome": row["outcome"],
            "risk": {"horizon_sigma": sigma, "p_drawdown_5pct": risk.p_drawdown(sigma, 0.05),
                     "p_drawdown_10pct": risk.p_drawdown(sigma, 0.10)},
            "calibration": ("isotonic" if (settled_count or 0) >= 50
                            else f"uncalibrated ({settled_count or 0} of 50 settled forecasts)")}


def realised_excess(closes_from_asof: list[float], bench_from_asof: list[float], horizon: int) -> float | None:
    """Excess return from the cutoff bar to the horizon-th later bar; None if not yet available."""
    if len(closes_from_asof) <= horizon or len(bench_from_asof) <= horizon:
        return None
    return (closes_from_asof[horizon] / closes_from_asof[0]) - (bench_from_asof[horizon] / bench_from_asof[0])


def settle_due(book: Ledger, fetch, today=None) -> dict:
    """Settle matured cards exactly once. fetch(symbol, as_of_date, horizon) -> (closes, bench) from the cutoff bar."""
    from datetime import date
    today = today or date.today()
    settled, waiting = 0, 0
    for row in book.due(today):
        try:
            closes, bench = fetch(row["symbol"], row["as_of"][:10], row["horizon"])
            excess = realised_excess(closes, bench, row["horizon"])
        except Exception:  # noqa: BLE001 - a provider gap waits for the next run
            excess = None
        if excess is None:
            waiting += 1
            continue
        settled += book.settle(row["card_id"], excess)["settled"]
    return {"settled": settled, "waiting": waiting}


def live_inputs(symbol: str, as_of: datetime, lookback: int = 260) -> dict:
    """PIT price inputs from the backend's existing provider (lazy import; absent in tests)."""
    from app.data.yfinance_provider import YFinanceProvider
    prov = YFinanceProvider()
    s = prov.ohlcv(symbol, as_of, "1d", lookback=lookback)
    b = prov.ohlcv("^NSEI", as_of, "1d", lookback=lookback)
    joined = s[["Close", "Volume"]].join(b[["Close"]].rename(columns={"Close": "Bench"}), how="inner").dropna()
    return {"closes": joined["Close"].astype(float).tolist(), "bench": joined["Bench"].astype(float).tolist(),
            "volumes": joined["Volume"].astype(float).tolist(), "last_bar": joined.index[-1].isoformat()}


# ---- live wiring shared by the API routes and the daily jobs ---------------------------

def generate_live(name: str, horizon: int, complete, sector: str = "UNKNOWN", articles: list[dict] | None = None,
                  book: Ledger | None = None, now: datetime | None = None) -> dict:
    """Build, lock and annotate one live card. Reuses an existing card for the same bar."""
    from . import inputs
    from .robustness import narrative_crowding
    book = book or ledger()
    now = now or datetime.now(timezone.utc)
    data = live_inputs(f"{name}.NS", now)
    as_of = data["last_bar"]
    for row in book.cards(symbol=name, limit=50):
        if row["card"]["horizon"] == horizon and row["card"]["as_of"] == as_of:
            return {"row": row, "reused": True}
    extras = inputs.gather(name, as_of, horizon, articles)
    result = build(name, as_of, horizon, data["closes"], data["bench"], complete=complete, sector=sector,
                   volumes=data["volumes"], events=extras["events"], headlines=extras["headlines"],
                   flows=extras["flows"], scheduled_event=extras["scheduled_event"], book=book)
    recorded = book.record(result["card"], now)
    tones = [a.get("sentiment_score") for a in (articles or []) if a.get("influences_sentiment")]
    tones = [(t - 50) / 50 if t is not None and t > 1 else t for t in tones]
    book.put_extras(result["card"].card_id, {
        "votes": [v.__dict__ for v in result["votes"]], "sources": extras["sources"],
        "events": extras["events"], "headline_count": len(extras["headlines"]),
        "flows": extras["flows"], "crowding": narrative_crowding(result["votes"], tones),
        "extremize": result.get("extremize"), "last_close": data["closes"][-1]})
    row = next(r for r in book.cards(symbol=name, limit=50) if r["hash"] == recorded["hash"])
    return {"row": row, "reused": False}


def provider_fetch(symbol: str, as_of_date: str, horizon: int) -> tuple[list[float], list[float]]:
    """Closes for the stock and NIFTY from the cutoff bar onward, for settlement."""
    from datetime import date as _date
    from app.data.yfinance_provider import YFinanceProvider
    prov = YFinanceProvider()
    now = datetime.now(timezone.utc)
    s = prov.ohlcv(f"{symbol}.NS", now, "1d", lookback=horizon + 40)
    b = prov.ohlcv("^NSEI", now, "1d", lookback=horizon + 40)
    joined = s[["Close"]].join(b[["Close"]].rename(columns={"Close": "Bench"}), how="inner").dropna()
    joined = joined[joined.index.date >= _date.fromisoformat(as_of_date)]
    return joined["Close"].astype(float).tolist(), joined["Bench"].astype(float).tolist()


def vix_percentile(now: datetime | None = None) -> float | None:
    from app.data.yfinance_provider import YFinanceProvider
    try:
        closes = YFinanceProvider().ohlcv("^INDIAVIX", now or datetime.now(timezone.utc), "1d",
                                          lookback=260)["Close"].dropna().astype(float).tolist()
    except Exception:  # noqa: BLE001
        return None
    if len(closes) < 60:
        return None
    return sum(v < closes[-1] for v in closes[:-1]) / (len(closes) - 1)


def status(row: dict, snapshot: dict, new_events: list[str]) -> dict:
    """Tripwire state for one locked card against a fresh snapshot."""
    from .falsifiers import Falsifier, evaluate
    rules = []
    for rule in row["card"].get("falsifiers", []):
        severity = "soft" if rule.startswith(("vix_pct", "excess_ret_5d", "event:promoter_buy")) else "hard"
        rules.append(Falsifier(rule, severity))
    out = evaluate(rules, snapshot, new_events)
    out["settled"] = row["settled_at"] is not None
    return out


def live_snapshot(name: str, row: dict, articles: list[dict] | None = None) -> tuple[dict, list[str]]:
    """Fresh close, 5-session excess move, VIX percentile and announcements since the card's cutoff."""
    from . import inputs
    from .evidence import features as feats
    now = datetime.now(timezone.utc)
    data = live_inputs(f"{name}.NS", now)
    f = feats(data["closes"], data["bench"])
    snap = {"close": data["closes"][-1], "excess_ret_5d": f["excess_ret_5d"], "ret_5d": f["ret_5d"],
            "vol_20d": f["vol_20d"], "dist_hi20": f["dist_hi20"], "dist_lo20": f["dist_lo20"],
            "vix_pct": vix_percentile(now)}
    since = inputs.cutoff(row["card"]["as_of"])
    if articles is None:
        try:
            from ..news.service import news_service
            import asyncio
            articles = asyncio.run(news_service.stock_news(name)).get("articles", [])
        except Exception:  # noqa: BLE001
            articles = []
    _, events = inputs.headlines_and_announcements(articles, name, now, lookback_days=60)
    kinds = [e.kind for e in events if e.disclosed_at > since.isoformat()]
    return snap, kinds


def personal_view(row: dict, sector: str, body: dict) -> dict:
    """Personal fit for one locked card and the caller's paper book."""
    from .personal import behaviour_flags, fit
    card = row["card"]
    equity = float(body.get("equity") or 0.0)
    positions = {p["symbol"]: {"value": float(p["value"]), "sector": p.get("sector") or "UNKNOWN",
                               "vol": float(p.get("vol") or 0.02)} for p in body.get("positions", [])}
    daily = (card.get("vol_forecast") or 0.02 * card["horizon"] ** 0.5) / card["horizon"] ** 0.5
    orders = [{"id": str(o.get("id", i)), "side": str(o.get("side", "")).lower(),
               "at": o.get("at") or o.get("created_at"), "pnl_pct": o.get("pnl_pct"), "held_days": o.get("held_days")}
              for i, o in enumerate(body.get("orders", [])) if o.get("at") or o.get("created_at")]
    flags = behaviour_flags(orders, now=datetime.now(timezone.utc))
    out = fit(card, sector, daily, {"equity": equity, "positions": positions}, body.get("profile", "balanced"), flags)
    out["note"] = "Volatility of other holdings is approximated at 2% a day unless supplied."
    return out

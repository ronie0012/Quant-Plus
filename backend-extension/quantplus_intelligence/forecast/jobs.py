"""Scheduled forecast jobs. Run from the backend directory:

  python -m quantplus_intelligence.forecast.jobs daily        # lock forecasts for the universe
  python -m quantplus_intelligence.forecast.jobs tournament   # blind sector tournaments
  python -m quantplus_intelligence.forecast.jobs settle       # settle matured cards + tournaments, write head
  python -m quantplus_intelligence.forecast.jobs blind-gap    # named vs blind memorisation report
  python -m quantplus_intelligence.forecast.jobs risk-bench   # volatility forecasts vs naive and India VIX
  python -m quantplus_intelligence.forecast.jobs metalabel    # meta-label vs deterministic core
  python -m quantplus_intelligence.forecast.jobs crowding     # pre-registered crowding -> volatility test
  python -m quantplus_intelligence.forecast.jobs event-study  # forward abnormal returns per disclosure type

Reports are written under data/forecast_reports/. Every job is safe to re-run.
"""
from __future__ import annotations

import argparse
import hashlib
import asyncio
import json
import math
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

from . import metalabel, scoring, service, tournament
from .evidence import EvidenceCard, features, render
from .forecasters import gateway_complete, run_crowd
from .robustness import memorisation_gap

REPORTS = Path(os.environ.get("FORECAST_REPORT_DIR", "data/forecast_reports"))


def _write(name: str, payload: dict) -> str:
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / f"{name}_{date.today().isoformat()}.json"
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return str(path)


def universe(limit: int | None = None) -> tuple[list[str], dict[str, str]]:
    """Official NIFTY 50 membership with industries; falls back to the warm list."""
    try:
        from ..market_data import market_data
        uni = asyncio.run(market_data.universe())
        symbols, industries = uni.get("symbols", []), uni.get("industries", {})
    except Exception:  # noqa: BLE001
        symbols, industries = [], {}
    if not symbols:
        symbols = [s.strip() for s in os.environ.get(
            "STOCK_PREDICTION_WARM_SYMBOLS", "HDFCBANK,RELIANCE,TCS,INFY,ICICIBANK").split(",") if s.strip()]
    if not industries:
        from app.api.stocks import stock_catalog
        industries = {r["symbol"]: r["sector"] for r in stock_catalog()}
    return symbols[:limit] if limit else symbols, industries


def daily(horizons=(5, 20), limit: int | None = None, pace: float = 2.0) -> dict:
    symbols, industries = universe(limit)
    complete = gateway_complete("forecaster", "forecast:daily")
    done, reused, failed = 0, 0, {}
    for name in symbols:
        try:
            from ..news.service import news_service
            articles = asyncio.run(news_service.stock_news(name)).get("articles", [])
        except Exception:  # noqa: BLE001
            articles = []
        for h in horizons:
            try:
                out = service.generate_live(name, h, complete, industries.get(name, "UNKNOWN"), articles)
                reused += out["reused"]
                done += not out["reused"]
            except Exception as error:  # noqa: BLE001 - one stock never stops the batch
                failed[f"{name}:{h}"] = f"{type(error).__name__}: {error}"[:200]
        time.sleep(pace)
    return {"job": "daily", "symbols": len(symbols), "locked": done, "reused": reused, "failed": failed}


def run_tournament(horizon: int = 5, size: int = 6, rounds: int = 3, limit: int | None = None) -> dict:
    symbols, industries = universe(limit)
    now = datetime.now(timezone.utc)
    blocks, sectors, day = {}, {}, None
    for name in symbols:
        try:
            data = service.live_inputs(f"{name}.NS", now)
            card = EvidenceCard(name, data["last_bar"], industries.get(name, "UNKNOWN"),
                                features(data["closes"], data["bench"], volumes=data["volumes"]))
            blocks[name] = render(card, ("technical", "relative"), blind=True)
            sectors.setdefault(card.sector, []).append(name)
            day = day or data["last_bar"][:10]
        except Exception:  # noqa: BLE001
            continue
    complete = gateway_complete("forecaster", "forecast:tournament")
    stored, skipped = 0, []
    book = service.ledger()
    for sector, names in sectors.items():
        if len(names) < 3:
            skipped.append(sector)       # too few peers for a meaningful ranking
            continue
        result = tournament.run(names, tournament.llm_ranker(complete, blocks, horizon),
                                size=min(size, len(names)), rounds=rounds, seed=int(hashlib.sha256(str(day).encode()).hexdigest()[:8], 16))
        if result["strengths"]:
            stored += book.put_tournament(day, horizon, sector, result)
    return {"job": "tournament", "day": day, "horizon": horizon, "ranked": stored,
            "sectors": len(sectors) - len(skipped), "skipped_small_sectors": skipped}


def settle() -> dict:
    book = service.ledger()
    cards = service.settle_due(book, service.provider_fetch)
    settled_days = 0
    for day, horizon in book.tournament_days(settled=False):
        from .ledger import maturity
        due = maturity(day, horizon)
        if not due or date.fromisoformat(due) > date.today():
            continue
        realised = {}
        for r in book.tournament_rows(day, horizon):
            try:
                closes, bench = service.provider_fetch(r["symbol"], day, horizon)
                value = service.realised_excess(closes, bench, horizon)
            except Exception:  # noqa: BLE001
                value = None
            if value is not None:
                realised[r["symbol"]] = value
        if realised:
            book.settle_tournament(day, horizon, realised)
            settled_days += 1
    chain = book.verify()
    REPORTS.mkdir(parents=True, exist_ok=True)
    with (REPORTS / "ledger_heads.jsonl").open("a", encoding="utf-8") as heads:
        heads.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(), **chain}) + "\n")
    return {"job": "settle", **cards, "tournament_days_settled": settled_days, "chain": chain}


def blind_gap(sample: int = 8, horizon: int = 5) -> dict:
    """Same evidence, named vs blind. Large gaps suggest the model retrieves memorised history."""
    symbols, industries = universe(sample)
    complete = gateway_complete("forecaster", "forecast:blind-gap")
    now = datetime.now(timezone.utc)
    rows = {}
    for name in symbols:
        try:
            data = service.live_inputs(f"{name}.NS", now)
            card = EvidenceCard(name, data["last_bar"], industries.get(name, "UNKNOWN"),
                                features(data["closes"], data["bench"], volumes=data["volumes"]))
            blind = run_crowd(card, horizon, complete, blind=True)
            named = run_crowd(card, horizon, complete, blind=False)
            rows[name] = memorisation_gap(blind, named)
        except Exception as error:  # noqa: BLE001
            rows[name] = {"error": type(error).__name__}
    gaps = [r["mean_gap"] for r in rows.values() if r.get("mean_gap") is not None]
    report = {"job": "blind-gap", "horizon": horizon, "per_symbol": rows,
              "mean_gap": mean(gaps) if gaps else None,
              "note": "Diagnostic only; promotion still requires forward-settled scores."}
    report["path"] = _write("blind_gap", report)
    return report


def _qlike(sigma: float, y: float) -> float:
    var = max(sigma * sigma, 1e-8)
    return math.log(var) + y * y / var


def risk_bench() -> dict:
    """Settled cards: model sigma vs India-VIX-implied sigma vs a constant sigma (QLIKE, lower is better)."""
    rows = [r for r in service.ledger().cards(settled=True, limit=100000) if r["card"].get("vol_forecast")]
    if len(rows) < 30:
        report = {"job": "risk-bench", "status": "INSUFFICIENT", "settled": len(rows), "needed": 30}
        report["path"] = _write("risk_bench", report)
        return report
    vix = {}
    try:
        from app.data.yfinance_provider import YFinanceProvider
        df = YFinanceProvider().ohlcv("^INDIAVIX", datetime.now(timezone.utc), "1d", lookback=600)
        vix = {d.date().isoformat(): float(v) for d, v in df["Close"].dropna().items()}
    except Exception:  # noqa: BLE001
        pass
    ys = [r["outcome"]["excess_return"] for r in rows]
    constant = math.sqrt(mean(y * y for y in ys))
    model, implied, flat = [], [], []
    for r, y in zip(rows, ys):
        h = r["card"]["horizon"]
        model.append(_qlike(r["card"]["vol_forecast"], y))
        flat.append(_qlike(constant, y))
        level = vix.get(r["card"]["as_of"][:10])
        if level:
            implied.append(_qlike(level / 100 * math.sqrt(h / 252), y))
    report = {"job": "risk-bench", "n": len(rows), "qlike_model": mean(model), "qlike_constant": mean(flat),
              "qlike_vix_implied": mean(implied) if implied else None, "n_vix": len(implied),
              "note": "VIX is index volatility, so it is a rough benchmark for single-stock excess returns; "
                      "the constant sigma is fitted in-sample and therefore flattering."}
    report["path"] = _write("risk_bench", report)
    return report


def run_metalabel() -> dict:
    """Join settled core forward decisions to the nearest earlier forecast card; compare sizing."""
    try:
        from app.forward.records import matured_evidence
        decisions = matured_evidence()
    except Exception as error:  # noqa: BLE001
        return {"job": "metalabel", "status": "UNAVAILABLE", "reason": type(error).__name__}
    cards = service.ledger().cards(limit=100000)
    rows, labels, pnl = [], [], []
    for d in decisions:
        kind, _, value = d["outcome"].partition(":")
        symbol = d["instrument"].replace(".NS", "")
        prior = [c["card"] for c in cards if c["card"]["symbol"] == symbol and c["card"]["as_of"] <= d["ts"]
                 and not c["card"]["abstain"]]
        if not prior or kind not in ("GAIN", "LOSS"):
            continue
        c = max(prior, key=lambda x: x["as_of"])
        rows.append({"p_outperform": c["p_outperform"], "disagreement": c.get("disagreement") or 0.0,
                     "robustness": c.get("robustness") or 0.0, "p_event_shock": c.get("p_event_shock") or 0.0})
        labels.append(int(kind == "GAIN"))
        pnl.append(abs(float(value or 0)) * (1 if kind == "GAIN" else -1))
    result = metalabel.compare(rows, labels, pnl, ["p_outperform", "disagreement", "robustness", "p_event_shock"])
    report = {"job": "metalabel", "joined": len(rows), "decisions": len(decisions), **result,
              "rule": "promotion to the money path still requires the backend's G1-G5 gates"}
    report["path"] = _write("metalabel", report)
    return report


def abnormal_paths(events: list[dict], fetch, horizon: int = 20) -> dict[str, list[list[float]]]:
    """Daily stock-minus-NIFTY returns after each distinct event, grouped by event type.

    events carry symbol, kind and disclosed (ISO date). fetch(symbol, date, n) returns
    closes and benchmark closes from that date onward. Immature events are skipped.
    """
    paths: dict[str, list[list[float]]] = {}
    for e in events:
        try:
            closes, bench = fetch(e["symbol"], e["disclosed"][:10], horizon)
        except Exception:  # noqa: BLE001
            continue
        if len(closes) <= horizon or len(bench) <= horizon:
            continue
        path = [(closes[i] / closes[i - 1] - 1) - (bench[i] / bench[i - 1] - 1) for i in range(1, horizon + 1)]
        paths.setdefault(e["kind"], []).append(path)
    return paths


def event_study() -> dict:
    """Forward event study over events first seen by forecast cards (never backfilled history)."""
    from . import events as EV
    book = service.ledger()
    seen: dict[str, dict] = {}
    for r in book.cards(limit=100000):
        extra = book.extras(service.card_from_dict(r["card"]).card_id) or {}
        cutoff_day = r["card"]["as_of"][:10]
        for e in extra.get("events", []):
            if e.get("id") and e["id"] not in seen:
                disclosed = (date.fromisoformat(cutoff_day) - timedelta(days=int(e.get("days_ago", 0)))).isoformat()
                seen[e["id"]] = {"symbol": r["card"]["symbol"], "kind": e["kind"], "disclosed": disclosed}
    paths = abnormal_paths(list(seen.values()), service.provider_fetch)
    results = EV.study(paths)
    gate = EV.admit(results)
    report = {"job": "event-study", "events_seen": len(seen), "matured": sum(len(v) for v in paths.values()),
              "results": results, "gate": gate,
              "rule": "Only admitted types may shift forecasts (events.event_prior); none are wired in until admitted."}
    report["path"] = _write("event_study", report)
    return report


CROWDING_PREREG = {
    "hypothesis": "Cards with narrative crowding >= 0.8 have larger realised |excess return| than other cards.",
    "metric": "difference in mean |excess return|, CROWDED minus NORMAL, settled cards only",
    "decision": "SUPPORTED if difference > 0 and Welch t > 2 with >= 30 cards per group; otherwise NOT SUPPORTED",
    "registered": "2026-10-20, before any crowding-tagged card settled",
    "direction_use": "none until supported as a volatility signal",
}


def crowding_test() -> dict:
    book = service.ledger()
    groups = {"CROWDED": [], "NORMAL": []}
    for r in book.cards(settled=True, limit=100000):
        extra = book.extras(service.card_from_dict(r["card"]).card_id) or {}
        label = (extra.get("crowding") or {}).get("label")
        if label in groups:
            groups[label].append(abs(r["outcome"]["excess_return"]))
    a, b = groups["CROWDED"], groups["NORMAL"]
    result = {"job": "crowding", "prereg": CROWDING_PREREG, "n_crowded": len(a), "n_normal": len(b)}
    if len(a) >= 30 and len(b) >= 30:
        va = sum((x - mean(a)) ** 2 for x in a) / (len(a) - 1)
        vb = sum((x - mean(b)) ** 2 for x in b) / (len(b) - 1)
        t = (mean(a) - mean(b)) / math.sqrt(va / len(a) + vb / len(b)) if va + vb else None
        result.update(diff=mean(a) - mean(b), t_stat=t,
                      verdict="SUPPORTED" if t is not None and t > 2 else "NOT SUPPORTED")
    else:
        result["verdict"] = "INSUFFICIENT"
    result["path"] = _write("crowding", result)
    return result


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("job", choices=("daily", "tournament", "settle", "blind-gap", "risk-bench",
                                        "metalabel", "crowding", "event-study"))
    parser.add_argument("--limit", type=int, default=None, help="cap the universe (cost control)")
    parser.add_argument("--horizon", type=int, default=5, choices=(5, 20))
    args = parser.parse_args(argv)
    jobs = {"daily": lambda: daily(limit=args.limit), "tournament": lambda: run_tournament(args.horizon, limit=args.limit),
            "settle": settle, "blind-gap": lambda: blind_gap(args.limit or 8, args.horizon),
            "risk-bench": risk_bench, "metalabel": run_metalabel, "crowding": crowding_test,
            "event-study": event_study}
    print(json.dumps(jobs[args.job](), indent=2, default=str))


if __name__ == "__main__":
    main()

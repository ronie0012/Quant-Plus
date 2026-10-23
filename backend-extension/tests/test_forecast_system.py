import json
import math
import random
from datetime import date, datetime, timedelta, timezone

import pytest

from quantplus_intelligence.forecast import (aggregate as agg, baselines, calibration, events, evidence,
                                             falsifiers, forecasters, ledger as L, metalabel, personal,
                                             risk, robustness, schema, scoring, service, textdiff, tournament)
from quantplus_intelligence.forecast.forecasters import Vote


def weekdays(day):
    return day.weekday() < 5


def series(n=300, drift=0.0005, vol=0.015, seed=1, start=100.0):
    rng = random.Random(seed)
    out = [start]
    for _ in range(n - 1):
        out.append(out[-1] * (1 + drift + rng.gauss(0, vol)))
    return out


def card(**kw):
    base = dict(symbol="RELIANCE", as_of="2026-10-01T10:00:00+00:00", horizon=5, benchmark="NIFTY50",
                p_outperform=0.6, quantiles={"0.1": -0.04, "0.5": 0.0, "0.9": 0.04}, vol_forecast=0.03,
                p_event_shock=0.05)
    base.update(kw)
    return schema.ForecastCard(**base)


# Move 1: schema and scoring
def test_card_rejects_llm_authority_and_bad_probabilities():
    with pytest.raises(ValueError):
        card(authority="PORTFOLIO_MANAGER")
    with pytest.raises(ValueError):
        card(p_outperform=1.2)
    with pytest.raises(ValueError):
        card(p_outperform=None)
    with pytest.raises(ValueError):
        card(quantiles={"0.1": 0.05, "0.5": 0.0, "0.9": 0.04})
    assert card(p_outperform=None, abstain=True, abstain_reason="thin evidence").abstain


def test_card_id_is_content_addressed_and_round_trips():
    a = card(contributions=(schema.Contribution("technical", 0.6, 1.0, 0.62),))
    restored = schema.card_from_dict(json.loads(schema.canonical(a.to_dict())))
    assert restored.card_id == a.card_id
    assert card(p_outperform=0.61).card_id != a.card_id


def test_scoring_rules():
    assert scoring.brier(1.0, 1) == 0 and scoring.brier(0.5, 0) == 0.25
    assert scoring.log_loss(0.5, 1) == pytest.approx(math.log(2))
    assert scoring.pinball(0.0, 0.9, 1.0) == pytest.approx(0.9)
    assert scoring.skill(0.2, 0.25) == pytest.approx(0.2)
    assert scoring.spearman([1, 2, 3, 4], [10, 20, 30, 40]) == pytest.approx(1.0)
    assert scoring.days_to_significance(0.03, 0.10) == 45
    curve = scoring.coverage_curve([(0.9, 1), (0.55, 0), (0.1, 0), (0.5, 1)], levels=(0.5, 1.0))
    assert curve[0]["n"] == 2 and curve[0]["brier"] < curve[1]["brier"]


def test_baselines_are_weak_and_bounded():
    assert baselines.momentum({"excess_ret_20d": 5.0}) <= 0.7
    assert baselines.momentum({}) == 0.5
    assert baselines.reversal({"excess_ret_5d": 0.1}) < 0.5


# Move 10: ledger
def test_ledger_locks_before_outcome_settles_once_and_detects_tampering():
    book = L.Ledger(is_trading_day=weekdays)
    c = card()
    rec = book.record(c, recorded_at=datetime(2026, 10, 1, 11, tzinfo=timezone.utc))
    assert rec["matures_on"] == "2026-10-08" and not rec["duplicate"]
    assert book.record(c, recorded_at=datetime(2026, 10, 1, 12, tzinfo=timezone.utc))["duplicate"]
    with pytest.raises(ValueError):
        book.record(card(p_outperform=0.7), recorded_at=datetime(2026, 10, 9, tzinfo=timezone.utc))
    with pytest.raises(ValueError):
        book.settle(c.card_id, 0.01, settled_at=datetime(2026, 10, 7, tzinfo=timezone.utc))
    assert book.due(date(2026, 10, 8))[0]["card_id"] == c.card_id
    assert book.settle(c.card_id, 0.02, settled_at=datetime(2026, 10, 8, 12, tzinfo=timezone.utc))["settled"]
    assert not book.settle(c.card_id, -0.5, settled_at=datetime(2026, 10, 9, tzinfo=timezone.utc))["settled"]
    board = book.scoreboard()
    assert board["scored"] == 1 and board["brier"] == pytest.approx(0.16) and board["chain"]["valid"]
    book.conn.execute("UPDATE forecast_ledger SET payload=replace(payload, '0.6', '0.9')")
    assert not book.verify()["valid"]


def test_maturity_abstains_on_unverified_calendar():
    assert L.maturity("2026-10-01", 5, lambda d: None) is None


# Move 5: evidence and blindfold
def test_features_and_blind_render_hide_identity_and_dates():
    s, b = series(seed=2), series(seed=3)
    f = evidence.features(s, b, volumes=[1000.0] * 300)
    assert {"excess_ret_20d", "vol_20d", "blowoff_flag"} <= set(f)
    ev = evidence.EvidenceCard("RELIANCE.NS", "2026-10-01", "Energy", f,
                               headlines=["Reliance Industries shares rise on 2026-09-30"], aliases=("Reliance Industries",))
    text = evidence.render(ev, ("technical", "news"), blind=True)
    assert "reliance" not in text.lower() and "2026" not in text and "Company A" in text
    assert "RELIANCE" in evidence.render(ev, "technical", blind=False)
    with pytest.raises(ValueError):
        evidence.features(s[:10], b[:10])


# Move 4: crowd and aggregation
def test_crowd_parses_strictly_and_aggregates_in_code():
    assert forecasters.parse_vote("x", "not json").abstain
    assert forecasters.parse_vote("x", '{"p_outperform": 1.5}').abstain
    assert forecasters.parse_vote("x", '{"p_outperform": 0.62, "abstain": false}').p == 0.62
    f = evidence.features(series(seed=4), series(seed=5))
    ev = evidence.EvidenceCard("TCS", "2026-10-01", "IT", f)
    seen = []

    def fake(system, user):
        seen.append(user)
        return '{"p_outperform": 0.58, "abstain": false, "reason": "ok"}'
    votes = forecasters.run_crowd(ev, 5, fake)
    by = {v.forecaster: v for v in votes}
    assert by["events"].abstain and by["news"].abstain and by["flows"].abstain   # empty slices abstain
    assert by["technical"].p == 0.58 and not by["momentum"].abstain
    assert all("TCS" not in u for u in seen)
    out = agg.aggregate(votes)
    assert not out["abstain"] and 0 < out["p"] < 1 and out["contributions"]
    assert agg.aggregate([Vote("a", None, True)] * 5)["abstain"]


def test_track_record_debias_and_weights():
    history = {"biased": [(0.7, 1), (0.7, 0)] * 20, "good": [(0.8, 1), (0.2, 0)] * 20}
    rec = agg.track_record(history)
    assert rec["biased"]["bias"] == pytest.approx(0.2)
    assert agg.debias(0.7, rec["biased"]) == pytest.approx(0.5)
    assert agg.weight(rec["good"]) > agg.weight(rec["biased"]) == agg.FLOOR_WEIGHT


# Move 6: risk and calibration
def test_risk_ranges_and_drawdown():
    sigma = risk.horizon_vol(0.01, 4)
    assert sigma == pytest.approx(0.02)
    q = risk.quantiles(sigma, margin=0.01)
    assert q["0.1"] < q["0.5"] < q["0.9"] and q["0.9"] == pytest.approx(1.2816 * 0.02 + 0.01, rel=1e-3)
    assert risk.p_drawdown(0.02, 0.05) < risk.p_drawdown(0.04, 0.05)
    assert risk.p_event_shock(0.02, True) > risk.p_event_shock(0.02, False)
    assert risk.ewma_vol([0.01, -0.01] * 30) == pytest.approx(0.01, rel=0.05)


def test_isotonic_refuses_small_samples_and_is_monotone():
    iso = calibration.Isotonic().fit([(0.6, 1)] * 10)
    assert not iso.fitted and iso(0.6) == 0.6
    rng = random.Random(0)
    pairs = [(p, int(rng.random() < p)) for p in (rng.random() for _ in range(500))]
    iso = calibration.Isotonic().fit(pairs)
    assert iso.fitted and iso(0.2) <= iso(0.5) <= iso(0.8)


def test_conformal_margin_reaches_nominal_coverage():
    rng = random.Random(1)
    rows = [(-0.01, 0.01, rng.gauss(0, 0.03)) for _ in range(400)]
    q = calibration.conformal_margin(rows[:200], 0.8)
    covered = scoring.interval_coverage([(lo - q, hi + q, y) for lo, hi, y in rows[200:]])
    assert 0.72 <= covered <= 0.9
    assert calibration.conformal_margin(rows[:10]) is None


# Move 2: tournaments
def test_plackett_luce_recovers_order_and_ic():
    truth = ["A", "B", "C", "D", "E", "F", "G", "H"]
    ranker = lambda names: sorted(names, key=truth.index)
    out = tournament.run(truth, ranker, size=4, rounds=4)
    order = sorted(out["strengths"], key=out["strengths"].get, reverse=True)
    assert order == truth and out["failed_sets"] == 0
    p = out["p_outperform_sector"]
    assert p["A"] > 0.5 > p["H"]
    realised = {x: -i for i, x in enumerate(truth)}
    assert tournament.daily_ic(out["strengths"], realised) == pytest.approx(1.0)


def test_llm_ranker_rejects_incomplete_rankings():
    blocks = {"X": "a", "Y": "b"}
    bad = tournament.llm_ranker(lambda s, u: '{"ranking": ["C1"]}', blocks, 5)
    good = tournament.llm_ranker(lambda s, u: '{"ranking": ["C2", "C1"]}', blocks, 5)
    assert bad(["X", "Y"]) is None and good(["X", "Y"]) == ["Y", "X"]


# Move 3: events and diffs
def test_event_classification_and_pit_window():
    assert events.classify("Disclosure under SAST: promoter acquisition of shares") == "promoter_buy"
    assert events.classify("Creation of pledge on promoter shares") == "pledge_create"
    assert events.classify("Resignation of statutory auditor") == "auditor_resign"
    assert events.classify("General update to shareholders") is None
    evs = [events.Event("1", "TCS", "promoter_buy", "2026-09-25", {}),
           events.Event("2", "TCS", "pledge_create", "2026-10-05", {})]
    window = events.in_window(evs, "TCS", "2026-10-01")
    assert [w["id"] for w in window] == ["1"] and window[0]["days_ago"] == 6


def test_event_study_gate_needs_forward_evidence():
    rng = random.Random(3)
    data = {"promoter_buy": [[0.004 + rng.gauss(0, 0.005) for _ in range(20)] for _ in range(60)],
            "bulk_sell": [[rng.gauss(0, 0.01) for _ in range(20)] for _ in range(60)]}
    res = events.study(data)
    gate = events.admit(res)
    assert "promoter_buy" in gate["admitted"] and "bulk_sell" not in gate["admitted"]
    assert events.admit(res, forward_only=False)["admitted"] == {}
    prior = events.event_prior([{"kind": "promoter_buy", "days_ago": 1}], gate["admitted"])
    assert prior > 0.5


def test_text_diff_and_grounded_labels():
    prev = "Revenue grew strongly this quarter across all segments. Margins were stable and healthy overall."
    curr = prev + " We see a meaningful risk of demand slowdown in export markets next year."
    d = textdiff.diff(prev, curr)
    assert d["added"] == 1 and d["added_risk_sentences"] and d["risk_density_change"] > 0
    reply = json.dumps({"changes": [
        {"type": "new_risk", "quote": "We see a meaningful risk of demand slowdown in export markets next year.", "source": "current"},
        {"type": "guidance_up", "quote": "We raise guidance to 30 percent growth.", "source": "current"}]})
    out = textdiff.labelled_changes(prev, curr, lambda s, u: reply)
    assert len(out["changes"]) == 1 and out["rejected"] == 1
    assert textdiff.as_event_facts(d, out)["n_new_risk"] == 1


# Move 7: meta-labeling
def test_metalabel_is_down_only_and_refuses_small_samples():
    m = metalabel.MetaLabeler(["x"]).fit([{"x": 1}] * 10, [1] * 10)
    assert m.size(0.025, {"x": 1})["size"] == 0.025
    rng = random.Random(5)
    rows = [{"x": rng.gauss(0, 1)} for _ in range(300)]
    labels = [int(r["x"] + rng.gauss(0, 0.5) > 0) for r in rows]
    m = metalabel.MetaLabeler(["x"]).fit(rows, labels)
    assert m.proba({"x": 2}) > 0.8 > 0.2 > m.proba({"x": -2})
    assert m.size(0.025, {"x": 5})["size"] <= 0.025 and m.size(0.025, {"x": -5})["size"] == 0
    pnl = [0.02 if y else -0.02 for y in labels]
    assert metalabel.compare(rows, labels, pnl, ["x"])["status"] == "PASS"


# Move 8: falsifiers
def test_falsifiers_parse_evaluate_and_never_guess():
    with pytest.raises(ValueError):
        falsifiers.Falsifier("__import__('os') > 1")
    rules = [falsifiers.Falsifier("close < 100", "hard"), falsifiers.Falsifier("vix_pct >= 0.85", "soft"),
             falsifiers.Falsifier("event:pledge_create", "hard")]
    assert falsifiers.evaluate(rules, {"close": 105, "vix_pct": 0.5})["status"] == "HEALTHY"
    assert falsifiers.evaluate(rules, {"close": 105, "vix_pct": 0.9})["status"] == "WEAKENED"
    assert falsifiers.evaluate(rules, {"close": 105}, ["pledge_create"])["status"] == "BROKEN"
    assert falsifiers.evaluate(rules, {})["unobserved"] == 2
    made = falsifiers.defaults(0.6, 100, {"0.1": -0.05, "0.5": 0, "0.9": 0.05}, {"excess_vol_20d": 0.01}, 5)
    assert made[0].rule == "close < 95.0"


# Move 9: personal fit
def test_personal_fit_respects_profile_concentration_and_do_nothing():
    c = {"symbol": "TCS", "p_outperform": 0.62, "abstain": False}
    book = {"equity": 100000, "positions": {"INFY": {"value": 40000, "sector": "IT", "vol": 0.015}}}
    assert personal.fit(c, "IT", 0.015, book, "aggressive")["action"] == "consider"
    assert personal.fit(c, "IT", 0.015, book, "balanced")["action"] == "watch"    # IT already 40%
    assert personal.fit({**c, "p_outperform": 0.52}, "Energy", 0.015, book)["action"] == "do nothing"
    assert personal.fit({"symbol": "TCS", "abstain": True, "abstain_reason": "x"}, "IT", 0.01, book)["action"] == "do nothing"
    now = datetime(2026, 10, 10)
    orders = [{"id": str(i), "side": "buy", "at": (now - timedelta(days=1)).isoformat()} for i in range(16)]
    flags = personal.behaviour_flags(orders, {"0": {"blowoff_flag": 1}}, now)
    assert {f["flag"] for f in flags} == {"overtrading", "chasing"}


# Wildcards
def test_robustness_memorisation_and_crowding():
    votes = [Vote("a", 0.6, False), Vote("b", 0.61, False), Vote("c", 0.59, False), Vote("d", 0.6, False)]
    assert robustness.leave_one_out(votes)["robustness"] == 1.0
    split = [Vote("a", 0.8, False), Vote("b", 0.2, False), Vote("c", 0.55, False)]
    assert robustness.leave_one_out(split)["fragile"]
    gap = robustness.memorisation_gap(votes, [Vote("a", 0.8, False), Vote("b", 0.61, False)])
    assert gap["suspect"] == ["a"]
    assert robustness.narrative_crowding(votes, [0.5, 0.6])["label"] == "CROWDED"


# Service composition
def test_service_builds_records_and_labels_uncalibrated():
    book = L.Ledger(is_trading_day=weekdays)
    s, b = series(seed=7), series(seed=8)
    out = service.build("INFY", "2026-10-01T10:00:00+00:00", 5, s, b,
                        complete=lambda sy, u: '{"p_outperform": 0.57, "abstain": false}', book=book)
    c = out["card"]
    assert not c.abstain and c.falsifiers and c.robustness is not None and c.authority == "RESEARCH_ONLY"
    view = service.view(out, book.record(c, datetime(2026, 10, 1, 11, tzinfo=timezone.utc)))
    assert view["calibration"].startswith("uncalibrated") and view["ledger"]["hash"]
    offline = service.build("INFY", "2026-10-01T10:00:00+00:00", 5, s, b, complete=None, book=book,
                            crowd=forecasters.DEFAULT_CROWD[:6])
    assert offline["card"].abstain and "forecasters answered" in offline["card"].abstain_reason


# API routes (mocked prices and model; no network)
def test_forecast_routes_generate_reuse_and_score(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.stocks import website_auth
    from quantplus_intelligence import forecast_api

    book = L.Ledger(is_trading_day=weekdays)
    monkeypatch.setattr(service, "_ledger", book)
    s, b = series(seed=11), series(seed=12)
    monkeypatch.setattr(service, "live_inputs", lambda sym, now: {
        "closes": s, "bench": b, "volumes": [1000.0] * len(s), "last_bar": "2026-10-19T00:00:00"})
    monkeypatch.setattr(forecast_api, "gateway_complete",
                        lambda *a: (lambda sy, u: '{"p_outperform": 0.56, "abstain": false}'))
    monkeypatch.setattr(forecast_api, "_sector", lambda sym: "IT")
    async def no_news(name):
        return []
    monkeypatch.setattr(forecast_api, "_articles", no_news)
    from quantplus_intelligence.forecast import inputs
    monkeypatch.setattr(inputs, "gather", lambda *a, **k: {
        "headlines": ["Company shares rise"], "events": [], "flows": {"delivery_z20": 1.2},
        "scheduled_event": False, "sources": {"news": "available"}})
    app = FastAPI()
    app.include_router(forecast_api.router)
    app.dependency_overrides[website_auth] = lambda: None
    client = TestClient(app)
    assert client.get("/stocks/TCS/forecast").json()["forecast"] is None
    first = client.post("/stocks/TCS/forecast?horizon=5").json()
    assert not first["reused"] and first["forecast"]["symbol"] == "TCS"
    assert first["forecast"]["calibration"].startswith("uncalibrated") and first["forecast"]["hash"]
    assert client.post("/stocks/TCS/forecast?horizon=5").json()["reused"]
    assert client.get("/stocks/TCS/forecast").json()["forecast"]["hash"] == first["forecast"]["hash"]
    assert client.post("/stocks/TCS/forecast?horizon=7").status_code == 422
    fc = first["forecast"]
    assert fc["extras"]["sources"]["news"] == "available" and len(fc["extras"]["votes"]) == 8
    assert {v["forecaster"] for v in fc["extras"]["votes"] if not v["abstain"]} >= {"news", "flows"}
    monkeypatch.setattr(service, "live_snapshot", lambda name, row, articles=None: (
        {"close": 1.0, "vix_pct": 0.9, "excess_ret_5d": 0.0}, []))
    status = client.get("/stocks/TCS/forecast/status").json()
    assert status["status"] in ("WEAKENED", "BROKEN") and status["hash"] == fc["hash"]
    fit = client.post("/stocks/TCS/forecast/personal", json={
        "equity": 100000, "profile": "balanced",
        "positions": [{"symbol": "INFY", "value": 30000, "sector": "IT"}],
        "orders": [{"id": "1", "side": "BUY", "created_at": "2026-10-19T10:00:00Z"}]}).json()
    assert fit["action"] in ("consider", "watch", "do nothing", "avoid", "reduce") and fit["authority"] == "RESEARCH_ONLY"
    assert client.post("/stocks/TCS/forecast/personal", json={"profile": "yolo"}).status_code == 422
    assert client.post("/stocks/WIPRO/forecast/personal", json={}).status_code == 404
    board = client.get("/forecast/scoreboard").json()
    assert board["recorded"] == 1 and board["chain"]["valid"] and board["claim"].startswith("no settled")


def test_settle_due_uses_realised_excess():
    book = L.Ledger(is_trading_day=weekdays)
    c = card()
    book.record(c, recorded_at=datetime(2026, 10, 1, 11, tzinfo=timezone.utc))
    out = service.settle_due(book, lambda sym, d, h: ([100, 101, 102, 103, 104, 110], [100] * 6), date(2026, 10, 9))
    assert out == {"settled": 1, "waiting": 0}
    assert book.cards(settled=True)[0]["outcome"]["excess_return"] == pytest.approx(0.10)


# Live input wiring
def test_inputs_respect_cutoff_and_classify_announcements():
    from types import SimpleNamespace
    from quantplus_intelligence.forecast import inputs
    until = datetime(2026, 10, 19, 10, 0, tzinfo=timezone.utc)
    arts = [
        {"title": "Promoter acquisition of shares under SAST", "provider": "nse_announcements",
         "published_at": "2026-10-18T08:00:00Z"},
        {"title": "Creation of pledge by promoter", "provider": "nse_announcements",
         "published_at": "2026-10-20T08:00:00Z"},                       # after cutoff: excluded
        {"title": "Shares climb on order win", "provider": "google_news", "influences_sentiment": True,
         "published_at": "2026-10-18T09:00:00+05:30"},
        {"title": "Old story", "provider": "google_news", "influences_sentiment": True,
         "published_at": "2026-09-01T09:00:00Z"}]
    heads, evs = inputs.headlines_and_announcements(arts, "TCS", until)
    assert heads == ["Shares climb on order win"] and [e.kind for e in evs] == ["promoter_buy"]
    raw = [SimpleNamespace(kind="earnings_reported", date="2026-10-10", surprise_pct=8.5),
           SimpleNamespace(kind="earnings_upcoming", date="2026-10-24", surprise_pct=None)]
    reported, scheduled = inputs.results_events(raw, "TCS", until, 10)
    assert reported[0].facts["surprise_pct"] == 8.5 and scheduled


def test_tournament_storage_rank_and_ic_gate():
    book = L.Ledger(is_trading_day=weekdays)
    truth = ["A", "B", "C", "D"]
    result = tournament.run(truth, lambda n: sorted(n, key=truth.index), size=4, rounds=2)
    assert book.put_tournament("2026-10-01", 5, "IT", result) == 4
    rank = book.tournament_rank("B", 5)
    assert rank["rank"] == 2 and rank["of"] == 4
    book.settle_tournament("2026-10-01", 5, {"A": 0.03, "B": 0.01, "C": -0.01, "D": -0.02})
    ic = book.scoreboard()["tournament_ic"]
    assert ic["days"] == 1 and ic["mean_ic"] == pytest.approx(1.0) and ic["gate"] == "PENDING"


def test_jobs_report_insufficient_and_crowding_prereg(tmp_path, monkeypatch):
    from quantplus_intelligence.forecast import jobs
    book = L.Ledger(is_trading_day=weekdays)
    monkeypatch.setattr(service, "_ledger", book)
    monkeypatch.setattr(jobs, "REPORTS", tmp_path)
    assert jobs.risk_bench()["status"] == "INSUFFICIENT"
    out = jobs.crowding_test()
    assert out["verdict"] == "INSUFFICIENT" and out["prereg"]["registered"].startswith("2026-10-20")
    assert (tmp_path / f"crowding_{date.today().isoformat()}.json").exists()


def test_event_study_paths_skip_immature_and_compute_abnormal():
    from quantplus_intelligence.forecast import jobs
    evs = [{"symbol": "A", "kind": "promoter_buy", "disclosed": "2026-09-01"},
           {"symbol": "B", "kind": "promoter_buy", "disclosed": "2026-10-15"}]
    def fetch(sym, d, n):
        if sym == "B":
            return [100.0] * 3, [100.0] * 3           # immature
        return [100.0 * 1.01 ** i for i in range(25)], [100.0] * 25
    paths = jobs.abnormal_paths(evs, fetch, horizon=20)
    assert len(paths["promoter_buy"]) == 1 and paths["promoter_buy"][0][0] == pytest.approx(0.01)

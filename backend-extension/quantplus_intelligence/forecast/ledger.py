"""Hash-chained proof ledger: forecasts are locked before outcomes and settled exactly once."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

from .schema import ForecastCard, canonical, card_from_dict
from . import scoring

GENESIS = "0" * 64

SCHEMA = """
CREATE TABLE IF NOT EXISTS forecast_ledger (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT UNIQUE NOT NULL,
  symbol TEXT NOT NULL, as_of TEXT NOT NULL, horizon INTEGER NOT NULL,
  matures_on TEXT, payload TEXT NOT NULL,
  recorded_at TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL,
  settled_at TEXT, outcome TEXT
);
CREATE INDEX IF NOT EXISTS forecast_ledger_symbol ON forecast_ledger(symbol, as_of);
CREATE TABLE IF NOT EXISTS forecast_extras (
  card_id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS forecast_tournaments (
  day TEXT NOT NULL, horizon INTEGER NOT NULL, sector TEXT NOT NULL, symbol TEXT NOT NULL,
  strength REAL NOT NULL, p_outperform_sector REAL NOT NULL, sets INTEGER NOT NULL,
  realised_excess REAL, PRIMARY KEY(day, horizon, symbol)
);
"""


def maturity(as_of: str, horizon: int, is_trading_day=None) -> str | None:
    """Date of the horizon-th session after as_of; None if the calendar is unverified."""
    if is_trading_day is None:
        from ..exchange_calendar import is_trading_day
    day = datetime.fromisoformat(as_of).date()
    for _ in range(400):
        day += timedelta(days=1)
        verdict = is_trading_day(day)
        if verdict is None:
            return None
        if verdict:
            horizon -= 1
            if horizon == 0:
                return day.isoformat()
    return None


def _hash(prev: str, card_id: str, payload: str, recorded_at: str) -> str:
    return hashlib.sha256(f"{prev}|{card_id}|{payload}|{recorded_at}".encode()).hexdigest()


class Ledger:
    def __init__(self, path: str = ":memory:", is_trading_day=None):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        # The backend and the scheduled jobs share this file: WAL + a busy timeout serialise writers.
        self.conn = sqlite3.connect(path, check_same_thread=False, timeout=30)
        if path != ":memory:":
            self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        self.lock = threading.Lock()
        self.is_trading_day = is_trading_day

    def record(self, card: ForecastCard, recorded_at: datetime | None = None) -> dict:
        """Append a card. Idempotent per card_id; refuses to record after the outcome matured."""
        recorded_at = recorded_at or datetime.now(timezone.utc)
        payload = canonical(card.to_dict())
        matures = maturity(card.as_of, card.horizon, self.is_trading_day)
        if matures and recorded_at.date() >= date.fromisoformat(matures):
            raise ValueError("refusing to record a forecast whose outcome has already matured")
        with self.lock:
            row = self.conn.execute("SELECT seq, hash FROM forecast_ledger WHERE card_id=?", (card.card_id,)).fetchone()
            if row:
                return {"card_id": card.card_id, "seq": row[0], "hash": row[1], "duplicate": True}
            last = self.conn.execute("SELECT hash FROM forecast_ledger ORDER BY seq DESC LIMIT 1").fetchone()
            prev = last[0] if last else GENESIS
            stamp = recorded_at.isoformat()
            digest = _hash(prev, card.card_id, payload, stamp)
            cur = self.conn.execute(
                "INSERT INTO forecast_ledger(card_id, symbol, as_of, horizon, matures_on, payload, recorded_at, prev_hash, hash)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (card.card_id, card.symbol, card.as_of, card.horizon, matures, payload, stamp, prev, digest))
            self.conn.commit()
            return {"card_id": card.card_id, "seq": cur.lastrowid, "hash": digest, "matures_on": matures, "duplicate": False}

    def due(self, today: date) -> list[dict]:
        rows = self.conn.execute(
            "SELECT card_id, symbol, as_of, horizon, matures_on FROM forecast_ledger "
            "WHERE settled_at IS NULL AND matures_on IS NOT NULL AND matures_on <= ?", (today.isoformat(),)).fetchall()
        return [dict(zip(("card_id", "symbol", "as_of", "horizon", "matures_on"), r)) for r in rows]

    def settle(self, card_id: str, excess_return: float, settled_at: datetime | None = None) -> dict:
        """Exactly-once settlement with the realised excess return over the horizon."""
        settled_at = settled_at or datetime.now(timezone.utc)
        with self.lock:
            row = self.conn.execute("SELECT matures_on, settled_at FROM forecast_ledger WHERE card_id=?", (card_id,)).fetchone()
            if row is None:
                raise KeyError(card_id)
            if row[1] is not None:
                return {"card_id": card_id, "settled": False, "reason": "already settled"}
            if row[0] is None or settled_at.date() < date.fromisoformat(row[0]):
                raise ValueError("outcome has not matured")
            outcome = {"excess_return": excess_return, "outperformed": int(excess_return > 0)}
            self.conn.execute("UPDATE forecast_ledger SET settled_at=?, outcome=? WHERE card_id=?",
                              (settled_at.isoformat(), json.dumps(outcome), card_id))
            self.conn.commit()
            return {"card_id": card_id, "settled": True, **outcome}

    def verify(self) -> dict:
        """Recompute the chain; any edited payload or reordered row breaks it."""
        prev, n = GENESIS, 0
        for seq, card_id, payload, stamp, prev_hash, digest in self.conn.execute(
                "SELECT seq, card_id, payload, recorded_at, prev_hash, hash FROM forecast_ledger ORDER BY seq"):
            if prev_hash != prev or _hash(prev, card_id, payload, stamp) != digest:
                return {"valid": False, "broken_at": seq, "checked": n}
            if card_from_dict(json.loads(payload)).card_id != card_id:
                return {"valid": False, "broken_at": seq, "checked": n}
            prev, n = digest, n + 1
        return {"valid": True, "checked": n, "head": prev}

    def cards(self, symbol: str | None = None, settled: bool | None = None, limit: int = 500) -> list[dict]:
        sql, args = "SELECT payload, recorded_at, matures_on, settled_at, outcome, hash FROM forecast_ledger WHERE 1=1", []
        if symbol:
            sql += " AND symbol=?"
            args.append(symbol)
        if settled is not None:
            sql += " AND settled_at IS NOT NULL" if settled else " AND settled_at IS NULL"
        sql += " ORDER BY seq DESC LIMIT ?"
        args.append(limit)
        return [{"card": json.loads(p), "recorded_at": r, "matures_on": m, "settled_at": s,
                 "outcome": json.loads(o) if o else None, "hash": h}
                for p, r, m, s, o, h in self.conn.execute(sql, args)]

    def put_extras(self, card_id: str, payload: dict) -> None:
        """Display/diagnostic data (votes, sources, crowding). Not part of the hash chain."""
        with self.lock:
            self.conn.execute("INSERT OR IGNORE INTO forecast_extras(card_id, payload, created_at) VALUES (?,?,?)",
                              (card_id, json.dumps(payload, default=str), datetime.now(timezone.utc).isoformat()))
            self.conn.commit()

    def extras(self, card_id: str) -> dict | None:
        row = self.conn.execute("SELECT payload FROM forecast_extras WHERE card_id=?", (card_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def put_tournament(self, day: str, horizon: int, sector: str, result: dict) -> int:
        with self.lock:
            for symbol, strength in result["strengths"].items():
                self.conn.execute(
                    "INSERT OR REPLACE INTO forecast_tournaments(day, horizon, sector, symbol, strength, "
                    "p_outperform_sector, sets) VALUES (?,?,?,?,?,?,?)",
                    (day, horizon, sector, symbol, strength, result["p_outperform_sector"][symbol], result["sets"]))
            self.conn.commit()
        return len(result["strengths"])

    def tournament_rank(self, symbol: str, horizon: int) -> dict | None:
        row = self.conn.execute("SELECT day, sector FROM forecast_tournaments WHERE symbol=? AND horizon=? "
                                "ORDER BY day DESC LIMIT 1", (symbol, horizon)).fetchone()
        if not row:
            return None
        day, sector = row
        peers = self.conn.execute("SELECT symbol, strength, p_outperform_sector FROM forecast_tournaments "
                                  "WHERE day=? AND horizon=? AND sector=? ORDER BY strength DESC",
                                  (day, horizon, sector)).fetchall()
        rank = next(i for i, p in enumerate(peers, 1) if p[0] == symbol)
        return {"day": day, "sector": sector, "rank": rank, "of": len(peers),
                "p_outperform_sector": next(p[2] for p in peers if p[0] == symbol),
                "peers": [{"symbol": p[0], "strength": p[1]} for p in peers]}

    def tournament_days(self, settled: bool | None = None) -> list[tuple]:
        sql = "SELECT DISTINCT day, horizon FROM forecast_tournaments"
        if settled is False:
            sql += " WHERE realised_excess IS NULL"
        elif settled:
            sql += " WHERE realised_excess IS NOT NULL"
        return self.conn.execute(sql + " ORDER BY day").fetchall()

    def tournament_rows(self, day: str, horizon: int) -> list[dict]:
        rows = self.conn.execute("SELECT sector, symbol, strength, realised_excess FROM forecast_tournaments "
                                 "WHERE day=? AND horizon=?", (day, horizon)).fetchall()
        return [dict(zip(("sector", "symbol", "strength", "realised_excess"), r)) for r in rows]

    def settle_tournament(self, day: str, horizon: int, realised: dict[str, float]) -> None:
        with self.lock:
            for symbol, value in realised.items():
                self.conn.execute("UPDATE forecast_tournaments SET realised_excess=? WHERE day=? AND horizon=? "
                                  "AND symbol=? AND realised_excess IS NULL", (value, day, horizon, symbol))
            self.conn.commit()

    def tournament_ic(self) -> dict:
        """Daily rank IC (mean of within-sector Spearman) over settled tournament days."""
        daily = []
        for day, horizon in self.tournament_days(settled=True):
            by_sector: dict[str, list] = {}
            for r in self.tournament_rows(day, horizon):
                if r["realised_excess"] is not None:
                    by_sector.setdefault(r["sector"], []).append(r)
            ics = [scoring.spearman([r["strength"] for r in rows], [r["realised_excess"] for r in rows])
                   for rows in by_sector.values()]
            ics = [x for x in ics if x is not None]
            if ics:
                daily.append(mean(ics))
        summary = scoring.ic_summary(daily)
        summary["gate"] = ("PASS" if summary.get("t_stat") and summary["t_stat"] > 2 and summary["days"] >= 45
                           else "PENDING" if summary["days"] < 45 else "FAIL")
        return summary

    def scoreboard(self, baselines: dict[str, float] | None = None) -> dict:
        """Forward-only scores for the aggregate and each forecaster, with skill vs climatology."""
        rows = [r for r in self.cards(settled=True, limit=100000) if not r["card"]["abstain"]]
        total = self.conn.execute("SELECT COUNT(*) FROM forecast_ledger").fetchone()[0]
        abstained = sum(1 for r in self.cards(settled=True, limit=100000) if r["card"]["abstain"])
        pairs = [(r["card"]["p_outperform"], r["outcome"]["outperformed"]) for r in rows]
        clim = scoring.mean_score(scoring.brier, [(0.5, y) for _, y in pairs])
        per: dict[str, list] = {}
        for r in rows:
            for c in r["card"]["contributions"]:
                per.setdefault(c["forecaster"], []).append((c["p"], r["outcome"]["outperformed"]))
        crps = [scoring.crps_from_quantiles(r["card"]["quantiles"], r["outcome"]["excess_return"])
                for r in rows if r["card"]["quantiles"]]
        intervals = [(r["card"]["quantiles"]["0.1"], r["card"]["quantiles"]["0.9"], r["outcome"]["excess_return"])
                     for r in rows if {"0.1", "0.9"} <= set(r["card"]["quantiles"])]
        aggregate = scoring.mean_score(scoring.brier, pairs)
        return {
            "recorded": total, "settled": len(rows) + abstained, "scored": len(pairs), "abstained": abstained,
            "brier": aggregate, "log_loss": scoring.mean_score(scoring.log_loss, pairs),
            "brier_skill_vs_climatology": scoring.skill(aggregate, clim),
            "crps": mean(crps) if crps else None,
            "interval_80_coverage": scoring.interval_coverage(intervals),
            "reliability": scoring.reliability(pairs), "coverage_curve": scoring.coverage_curve(pairs),
            "forecasters": {name: {"n": len(v), "brier": scoring.mean_score(scoring.brier, v),
                                   "skill": scoring.skill(scoring.mean_score(scoring.brier, v), clim)}
                            for name, v in sorted(per.items())},
            "chain": self.verify(),
            "tournament_ic": self.tournament_ic(),
            "claim":"forward-settled only" if pairs else "no settled forecasts yet — no skill claim",
        }

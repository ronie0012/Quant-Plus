"""Bounded FYERS volume-baseline warming, with no provider/config/clock I/O.

Keep one ``BaselineWarmer`` per collector. Pass official membership to ``plan``
even before quotes arrive, fetch its reservations using the existing transport,
then call ``complete`` (also on failure/cancellation, with ``None``). All times
are supplied by the caller: an aware wall clock and a monotonic clock.

``baselines`` retains the collector's {(symbol, intraday): (expiry, payload)}
shape and dictionary identity. Read through ``get``/``histories`` rather than
that dictionary: these methods reap expired data and enforce validation. Cached
payloads are owned by the warmer and should be treated as read-only.
"""
from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from threading import RLock
from typing import Iterable, MutableMapping


IST = timezone(timedelta(hours=5, minutes=30))
MIN_DAILY_SESSIONS = 15
MIN_INTRADAY_SESSIONS = 5
NORMAL_MINUTES = frozenset(range(555, 930, 5))  # 09:15 through 15:25 bar starts.
BaselineKey = tuple[str, bool]
BaselineCache = MutableMapping[BaselineKey, tuple[float, dict]]


def _number(value):
    if isinstance(value, bool):
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError, OverflowError):
        return None


def _exchange_day(now: datetime) -> date:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(IST).date()


@dataclass(frozen=True)
class BaselineValidation:
    usable: bool
    samples: int = 0  # Distinct completed daily days or complete normal sessions.
    payload: dict | None = None
    reason: str | None = None


def validate_baseline(payload, *, intraday: bool, exchange_date: date) -> BaselineValidation:
    """Return only adequate, normalized history from dates before exchange_date.

    Daily legacy payloads may omit interval metadata. Intraday history must
    explicitly identify five-minute bars. Duplicate daily days, duplicate bars,
    off-grid/extra bars, invalid volumes, and zero-volume sessions cannot count
    toward adequacy. No weekday/holiday guesses: a normal session is exactly the
    75 regular five-minute slots, including an official special trading day.
    Partial and current/future sessions are excluded from the returned payload.
    """
    if not isinstance(payload, dict) or payload.get("source") != "fyers":
        return BaselineValidation(False, reason="not_fyers")
    interval, seconds = payload.get("interval"), payload.get("interval_seconds")
    if intraday:
        correct_interval = (interval == "5m" or seconds == 300) and interval in (None, "5m") and seconds in (None, 300)
    else:
        correct_interval = interval in (None, "1d") and seconds in (None, 86400)
    if not correct_interval:
        return BaselineValidation(False, reason="wrong_interval")
    candles = payload.get("candles")
    if not isinstance(candles, (list, tuple)):
        return BaselineValidation(False, reason="missing_candles")
    days = defaultdict(list)
    for candle in candles:
        if not isinstance(candle, dict):
            continue
        timestamp, volume = _number(candle.get("time")), _number(candle.get("volume"))
        if timestamp is None:
            continue
        try:
            local = datetime.fromtimestamp(timestamp, IST)
        except (ValueError, OSError, OverflowError):
            continue
        if local.date() >= exchange_date:
            continue
        valid = volume is not None and (volume >= 0 if intraday else volume > 0)
        if intraday:
            valid = valid and local.second == 0 and local.microsecond == 0 and local.hour * 60 + local.minute in NORMAL_MINUTES
        days[local.date()].append((local, {**candle, "time": timestamp, "volume": volume}) if valid else None)

    completed = []
    samples = 0
    for rows in days.values():
        if not intraday:
            adequate = len(rows) == 1 and rows[0] is not None
        else:
            adequate = (len(rows) == 75 and all(row is not None for row in rows) and
                        {row[0].hour * 60 + row[0].minute for row in rows if row is not None} == NORMAL_MINUTES and
                        0 < sum(row[1]["volume"] for row in rows if row is not None) < math.inf)
        if adequate:
            samples += 1
            completed.extend(row[1] for row in rows)
    minimum = MIN_INTRADAY_SESSIONS if intraday else MIN_DAILY_SESSIONS
    if samples < minimum:
        return BaselineValidation(False, samples=samples, reason="insufficient_completed_sessions")
    normalized = {**payload, "source": "fyers", "interval": "5m" if intraday else "1d",
                  "candles": sorted(completed, key=lambda candle: candle["time"])}
    return BaselineValidation(True, samples=samples, payload=normalized)


@dataclass(frozen=True)
class BaselineRequest:
    symbol: str
    intraday: bool
    token: int
    trading_date: date
    expires_monotonic: float

    @property
    def key(self) -> BaselineKey:
        return self.symbol, self.intraday


class BaselineWarmer:
    """Synchronous, thread-safe planning/state; the caller owns async I/O.

    The budget is shared across all plans in a rolling ``refresh_seconds``
    window, including calls that already finished. Reservations also cap total
    in-flight calls and prevent duplicate work; leases and tokens reject late
    completions. Expired leases become failures with a cooldown.

    Least-attempted keys go first, preferring a usable/in-flight counterpart at
    equal attempt counts, then oldest attempt and symbol order. Cold starts
    therefore warm daily+intraday for ten names within 20 calls, while failures
    cannot keep taking the budget ahead of untouched names or fair retries.
    """

    def __init__(self, baselines: BaselineCache | None = None, *, call_budget: int = 6,
                 minimum_samples: int = 10, max_symbols: int = 50,
                 refresh_seconds: float = 45, success_ttl_seconds: float = 21600,
                 cooldown_seconds: float = 300, reservation_seconds: float = 120,
                 allow_daily_fallback: bool = True):
        for name, value in (("call_budget", call_budget), ("minimum_samples", minimum_samples), ("max_symbols", max_symbols)):
            if isinstance(value, bool) or not isinstance(value, int) or value < (0 if name == "call_budget" else 1):
                raise ValueError(f"{name} must be a {'nonnegative' if name == 'call_budget' else 'positive'} integer")
        for value in (refresh_seconds, success_ttl_seconds, cooldown_seconds, reservation_seconds):
            if _number(value) is None or value <= 0:
                raise ValueError("TTLs, refresh and reservation durations must be positive and finite")
        self.baselines = baselines if baselines is not None else {}
        self.call_budget = call_budget
        self.minimum_samples = minimum_samples
        self.max_symbols = max_symbols
        self.refresh_seconds = refresh_seconds
        self.success_ttl_seconds = success_ttl_seconds
        self.cooldown_seconds = cooldown_seconds
        self.reservation_seconds = reservation_seconds
        self.allow_daily_fallback = allow_daily_fallback
        self._day = None
        self._sequence = 0
        self._attempts = {}
        self._validated = {}
        self._reservations = {}
        self._issued = deque()
        self._lock = RLock()

    def _symbols(self, symbols: Iterable[str]) -> tuple[str, ...]:
        return tuple(sorted({symbol for symbol in symbols if isinstance(symbol, str) and symbol}))[:self.max_symbols]

    def _discard(self, key):
        self.baselines.pop(key, None)
        self._validated.pop(key, None)

    def _sweep(self, now, monotonic):
        day = _exchange_day(now)
        if _number(monotonic) is None:
            raise ValueError("monotonic must be finite")
        # Legacy callers may clear/delete/replace entries in the shared dict.
        # Never retain an independently usable reference after that happens.
        for key, entry in list(self._validated.items()):
            if self.baselines.get(key) is not entry:
                self._validated.pop(key)
        if self._day is not None and self._day != day:
            # Yesterday's same-time curve must not survive a six-hour TTL that
            # spans IST midnight. Old in-flight results cannot refill it either.
            for key in list(self.baselines):
                if key[1]:
                    self._discard(key)
            self._reservations.clear()
        self._day = day
        while self._issued and self._issued[0] <= monotonic - self.refresh_seconds:
            self._issued.popleft()
        for key, request in list(self._reservations.items()):
            if request.expires_monotonic <= monotonic:
                self._reservations.pop(key)
                self._discard(key)
                self.baselines[key] = (monotonic + self.cooldown_seconds, {})
        for key, entry in list(self.baselines.items()):
            expiry, payload = entry
            expiry = _number(expiry)
            if expiry is None or expiry <= monotonic:
                self._discard(key)
            elif not payload:
                self._validated.pop(key, None)
                self.baselines[key] = (min(expiry, monotonic + self.cooldown_seconds), {})
            elif self._validated.get(key) is not entry:
                # Support legacy/preseeded dictionaries, without trusting the
                # collector's old "nonempty means success" cache policy.
                result = validate_baseline(payload, intraday=key[1], exchange_date=day)
                self._discard(key)
                if result.usable:
                    entry = (min(expiry, monotonic + self.success_ttl_seconds), result.payload)
                    self.baselines[key] = self._validated[key] = entry
                else:
                    self.baselines[key] = (monotonic + self.cooldown_seconds, {})
        return day

    def plan(self, symbols: Iterable[str], *, now: datetime, monotonic: float,
             include_intraday: bool = True, enabled: bool = True) -> tuple[BaselineRequest, ...]:
        """Reserve this refresh's bounded work from official membership, not ticks.

        Membership is sorted/deduplicated/capped, and removed members' state and
        payloads are released. ``enabled=False`` performs cleanup without using
        budget (e.g. an unavailable authenticated history transport).
        """
        symbols = self._symbols(symbols)
        with self._lock:
            day = self._sweep(now, monotonic)
            members = set(symbols)
            for mapping in (self.baselines, self._validated, self._attempts, self._reservations):
                for key in list(mapping):
                    if key[0] not in members:
                        mapping.pop(key)
            remaining = min(self.call_budget - len(self._issued), self.call_budget - len(self._reservations)) if enabled else 0
            kinds = (False, True) if include_intraday else (False,)
            keys = [(symbol, intraday) for symbol in symbols for intraday in kinds
                    if (symbol, intraday) not in self.baselines and (symbol, intraday) not in self._reservations]

            def priority(key):
                attempts, sequence = self._attempts.get(key, (0, 0))
                counterpart = (key[0], not key[1])
                paired = counterpart in self._validated or counterpart in self._reservations
                return attempts, not paired, sequence, key

            jobs = []
            for key in sorted(keys, key=priority)[:max(0, remaining)]:
                self._sequence += 1
                request = BaselineRequest(*key, self._sequence, day, monotonic + self.reservation_seconds)
                self._attempts[key] = (self._attempts.get(key, (0, 0))[0] + 1, self._sequence)
                self._reservations[key] = request
                self._issued.append(monotonic)
                jobs.append(request)
            return tuple(jobs)

    def complete(self, request: BaselineRequest, payload, *, now: datetime, monotonic: float) -> bool:
        """Finish a reservation; return True only for an adequate cached success.

        Pass None for exceptions/cancellation. Partial/empty histories retain no
        candles and receive only the retry cooldown, never the success TTL.
        Duplicate, timed-out, removed-member and previous-date results are ignored.
        TTLs begin at completion rather than at planning time.
        """
        with self._lock:
            day = self._sweep(now, monotonic)
            if self._reservations.get(request.key) != request or request.trading_date != day:
                return False
            self._reservations.pop(request.key)
            result = validate_baseline(payload, intraday=request.intraday, exchange_date=day)
            self._discard(request.key)
            ttl = self.success_ttl_seconds if result.usable else self.cooldown_seconds
            entry = (monotonic + ttl, result.payload if result.usable else {})
            self.baselines[request.key] = entry
            if result.usable:
                self._validated[request.key] = entry
            return result.usable

    def get(self, symbol: str, intraday: bool = False, *, now: datetime, monotonic: float) -> dict | None:
        """Read an adequate unexpired baseline, irrespective of fallback policy."""
        with self._lock:
            self._sweep(now, monotonic)
            entry = self._validated.get((symbol, intraday))
            return entry[1] if entry is not None else None

    def _usable(self, symbols, include_intraday):
        daily = {symbol: self._validated[(symbol, False)][1] for symbol in symbols if (symbol, False) in self._validated}
        intraday = {symbol: self._validated[(symbol, True)][1] for symbol in symbols
                    if include_intraday and (symbol, True) in self._validated}
        return daily, intraday

    def histories(self, symbols: Iterable[str], *, now: datetime, monotonic: float,
                  include_intraday: bool = True) -> tuple[dict, dict]:
        """Export (daily_by_symbol, intraday_by_symbol) for existing volume code.

        With allow_daily_fallback=False, daily-only names are withheld so the
        consumer cannot silently take its linear daily fallback. ``get`` still
        exposes their daily history for independent technical calculations.
        """
        with self._lock:
            self._sweep(now, monotonic)
            daily, intraday = self._usable(self._symbols(symbols), include_intraday)
            if not self.allow_daily_fallback:
                daily = {symbol: payload for symbol, payload in daily.items() if symbol in intraday}
            return daily, intraday

    def progress(self, symbols: Iterable[str], *, now: datetime, monotonic: float,
                 include_intraday: bool = True) -> dict:
        """Baseline coverage only; this does not assert fresh quote/RVOL coverage.

        requested/usable_* count symbols; queued counts outstanding reserved
        calls; in_cooldown counts failed daily/intraday keys. minimum_samples is
        the population target, not the 15-day/5-session history requirement.
        """
        symbols = self._symbols(symbols)
        with self._lock:
            self._sweep(now, monotonic)
            daily, intraday = self._usable(symbols, include_intraday)
            keys = {(symbol, kind) for symbol in symbols for kind in ((False, True) if include_intraday else (False,))}
            usable = set(daily) | set(intraday) if self.allow_daily_fallback else set(intraday)
            return {"requested": len(symbols), "queued": len(keys & self._reservations.keys()),
                    "usable_daily": len(daily), "usable_intraday": len(intraday),
                    "in_cooldown": sum(key in self.baselines and key not in self._validated for key in keys),
                    "minimum_samples": self.minimum_samples, "paired": len(set(daily) & set(intraday)),
                    "usable_samples": len(usable), "ready": len(usable) >= self.minimum_samples,
                    "allow_daily_fallback": self.allow_daily_fallback}

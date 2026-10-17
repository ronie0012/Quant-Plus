"""YFinance provider: daily-first, intraday stretch, disk cache, PIT enforcement."""
from __future__ import annotations
import os
import tempfile
import threading
import hashlib
from datetime import datetime, timedelta, timezone
import pandas as pd
from app.data.base import YF_DELAY_MIN, assert_pit

CACHE_DIR = "data/yf_cache"
os.makedirs(CACHE_DIR, exist_ok=True)
# Bounded striped locks: coalesce same-key downloads and serialize reads/replace
# on Windows, where replacing a CSV being read can raise PermissionError.
_CACHE_LOCKS = tuple(threading.RLock() for _ in range(64))


def _download_with_retry(instrument: str, start: str, end: str, interval: str,
                         attempts: int = 3, timeout_s: float = 60.0):
    """yf.download with a bounded hard timeout + retry.

    Yahoo intermittently returns transient errors (e.g. 401 "Invalid Crumb") or
    stalls; without a bound that can hang a whole eval for minutes (observed
    live 2026-10-06). Each attempt runs in a daemon thread so a stalled call is
    abandoned rather than blocking process exit. Retries only on failure — the
    returned frame is identical to a direct download, so no data semantics change.
    """
    import threading
    import time
    import yfinance as yf
    last: Exception | None = None
    for i in range(attempts):
        box: dict = {}

        def _work():
            try:
                box["df"] = yf.download(instrument, start=start, end=end, interval=interval,
                                        auto_adjust=False, progress=False, prepost=False)
            except Exception as e:  # noqa: BLE001 - surfaced below
                box["err"] = e

        t = threading.Thread(target=_work, daemon=True)
        t.start()
        t.join(timeout_s)
        if t.is_alive():
            last = TimeoutError(f"yfinance download timed out after {timeout_s}s")
        elif "err" in box:
            last = box["err"]
        else:
            return box.get("df")
        if i < attempts - 1:
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"yfinance fetch failed for {instrument} after {attempts} attempts: {last}")


class YFinanceProvider:
    name = "yfinance"

    def ohlcv(self, instrument: str, as_of: datetime, interval: str = "1d", lookback: int = 120) -> pd.DataFrame:
        import yfinance as yf
        as_of_utc = as_of if as_of.tzinfo else as_of.replace(tzinfo=timezone.utc)
        cutoff = as_of_utc - timedelta(minutes=YF_DELAY_MIN)
        # Cache key per day to avoid Yahoo bans during eval
        key = f"{CACHE_DIR}/{instrument.replace('.', '_')}_{interval}_{as_of_utc.date()}_completed_v3.csv"
        lock = _CACHE_LOCKS[int.from_bytes(hashlib.sha256(key.encode()).digest()[:2], "big") % len(_CACHE_LOCKS)]
        with lock:
            if os.path.exists(key):
                df = pd.read_csv(key, index_col=0, parse_dates=True)
            else:
                span = timedelta(days=max(180, lookback * 2)) if interval == "1d" else timedelta(days=60)
                end = (as_of_utc + timedelta(days=1)).date().isoformat()
                start = (as_of_utc - span).date().isoformat()
                df = _download_with_retry(instrument, start, end, interval)
                if df is None or df.empty:
                    raise RuntimeError(f"yfinance returned no data for {instrument} {interval}")
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = [c[0] for c in df.columns]
                # Atomic write: parallel analysts share one cache key per (instrument,
                # as_of); a plain df.to_csv let one thread read the file mid-write
                # (EmptyDataError crash, 2026-10-05 eval). Readers now see either no
                # file or a complete one; last writer wins with identical content.
                fd, tmp = tempfile.mkstemp(dir=CACHE_DIR, suffix=".csv")
                try:
                    with os.fdopen(fd, "w", encoding="utf-8") as f:
                        df.to_csv(f)
                    os.replace(tmp, key)
                except BaseException:
                    try:
                        os.remove(tmp)
                    except OSError:
                        pass
                    raise
        # Normalize tz-aware index
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        # Provider daily timestamps denote a session date, not completion.
        # A conservative end-of-local-day bound also covers special late sessions.
        # This intentionally makes daily bars unavailable until the following day.
        if interval == "1d":
            if not (instrument.endswith(".NS") or instrument.startswith("^NSE") or instrument == "^INDIAVIX"):
                raise RuntimeError("Daily completion policy is unavailable for this exchange")
            local_days = df.index.tz_convert("Asia/Kolkata").normalize()
            completed_at = local_days + pd.Timedelta(days=1)
        else:
            durations = {"1m": 1, "2m": 2, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "90m": 90, "1h": 60}
            if interval not in durations:
                raise RuntimeError(f"Unknown bar completion interval: {interval}")
            completed_at = df.index + pd.Timedelta(minutes=durations[interval])
        available_at = completed_at + pd.Timedelta(minutes=YF_DELAY_MIN)
        eligible = available_at <= as_of_utc
        df = df[eligible].copy()
        if df.empty:
            raise RuntimeError(f"All bars for {instrument} are after PIT cutoff {cutoff}")
        df["bar_end"] = completed_at[eligible]
        df["available_at"] = available_at[eligible]
        df["completed"] = True
        tail = df.tail(lookback).copy()
        assert_pit(tail["available_at"].iloc[-1].to_pydatetime(), as_of_utc)
        return tail

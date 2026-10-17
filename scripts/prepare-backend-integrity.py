"""Prepare reviewable backend edits without writing outside this workspace."""
from pathlib import Path
import hashlib
import json

backend = Path("D:/QP/agent-service")
output = Path("audit/implementation/backend-patch")
output.mkdir(parents=True, exist_ok=True)
manifest = []


def save(relative, updated):
    original = (backend / relative).read_bytes()
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(updated, encoding="utf-8")
    manifest.append({"path": relative, "before_sha256": hashlib.sha256(original).hexdigest(),
                     "after_sha256": hashlib.sha256(target.read_bytes()).hexdigest()})


path = "app/data/yfinance_provider.py"
s = (backend / path).read_text(encoding="utf-8")
s = s.replace('span = timedelta(days=180) if interval == "1d" else timedelta(days=60)',
              'span = timedelta(days=max(180, lookback * 2)) if interval == "1d" else timedelta(days=60)')
s = s.replace('_v2.csv"', '_completed_v3.csv"')
a = s.index('        df = df[df.index <= cutoff]')
s = s[:a] + '''        # Provider daily timestamps denote a session date, not completion.
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
'''
save(path, s)

path = "app/agents/analysts.py"
s = (backend / path).read_text(encoding="utf-8")
s = s.replace('hi52=', 'high_observed_bars=').replace('lo52=', 'low_observed_bars=')
s = s.replace('ret60d=', 'return_observed_bars=')
a = s.index('    extra = ""\n', s.index('def run_fundamentals'))
b = s.index('    system = ', a)
s = s[:a] + '''    # Current .info has no observation/filing timestamp. It cannot establish
    # availability at any decision cutoff, including recent historical requests.
    extra = " ratios=unavailable (as-filed point-in-time fundamentals are not connected; do not infer valuation)"
''' + s[b:]
s = s.replace('PIT note (Day 1 leak fix, NEW_PLAN T1.1): yfinance `.info` is a CURRENT snapshot\nwith no filing timestamp — serving it for a historical as_of would leak future\nrevisions into the prompt. Rule: historical as_of (>30d old) never sees .info;\nlive as_of may see it but labelled as current-snapshot, not PIT-guaranteed.',
              'Current yfinance .info is excluded from decision-time evidence because it lacks availability timestamps.')
save(path, s)

path = "quantplus_intelligence/calibration.py"
save(path, Path("backend-extension/quantplus_intelligence/calibration.py").read_text(encoding="utf-8"))
(output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Prepared {len(manifest)} backend edits with precondition hashes at {output}")

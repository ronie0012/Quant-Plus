"""Mocked external-backend probes: all imports/cache writes are isolated."""
from datetime import datetime, timezone
import importlib
import pytest


def provider(monkeypatch, tmp_path, index):
    monkeypatch.chdir(tmp_path)
    pd = pytest.importorskip("pandas")
    module = importlib.import_module("app.data.yfinance_provider")
    cache = tmp_path / "cache"
    cache.mkdir()
    monkeypatch.setattr(module, "CACHE_DIR", str(cache))
    frame = pd.DataFrame({"Open": [100] * len(index), "High": [150] * len(index),
                          "Low": [90] * len(index), "Close": [140] * len(index),
                          "Volume": [1000] * len(index)}, index=pd.DatetimeIndex(index))
    monkeypatch.setattr(module, "_download_with_retry", lambda *a, **k: frame)
    return module.YFinanceProvider()


def test_daily_full_candle_cannot_enter_intraday_cutoff(monkeypatch, tmp_path):
    item = provider(monkeypatch, tmp_path, [datetime(2024, 6, 10, tzinfo=timezone.utc)])
    with pytest.raises(RuntimeError, match="PIT cutoff"):
        item.ohlcv("AUDIT.NS", datetime(2024, 6, 10, 5, tzinfo=timezone.utc), "1d")


def test_completed_daily_bars_have_available_at(monkeypatch, tmp_path):
    item = provider(monkeypatch, tmp_path, [datetime(2024, 6, 10, tzinfo=timezone.utc)])
    result = item.ohlcv("AUDIT.NS", datetime(2024, 6, 11, 5, tzinfo=timezone.utc), "1d")
    assert result.iloc[-1]["Close"] == 140
    assert result.iloc[-1]["available_at"] <= datetime(2024, 6, 11, 5, tzinfo=timezone.utc)
    assert result.iloc[-1]["completed"]

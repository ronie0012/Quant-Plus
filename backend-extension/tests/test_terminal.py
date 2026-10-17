from quantplus_intelligence.terminal import candles_from, technical


def test_candles_reject_invalid_ohlcv_rows_and_sort_valid_rows():
    rows = [
        [3, 12, 13, 11, 12.5, 100],
        [1, 10, 11, 9, 10.5, 80],
        [2, 11, 12, 10, 11.5, 90],
        [4, 20, 19, 18, 19, 100],  # high below open: invalid
    ]
    candles = candles_from(rows)
    assert [item["time"] for item in candles] == [1, 2, 3]


def test_technical_metrics_are_based_on_observed_candles():
    candles = [
        {"time": i, "open": 100 + i, "high": 101 + i, "low": 99 + i, "close": 100 + i, "volume": 1000 + i}
        for i in range(80)
    ]
    result = technical(candles)
    assert result["rsi"] is not None
    assert result["momentum"] is not None
    assert result["sma20"] == sum(range(160, 180)) / 20
    assert result["ema50"] is not None
    assert result["relative_volume"] is not None

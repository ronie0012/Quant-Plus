from datetime import datetime, timedelta, timezone

import pytest

from quantplus_intelligence.market_structure import (
    METHODOLOGY_VERSION,
    analyze_market_structure,
)


UTC = timezone.utc
START = datetime(2026, 1, 5, 9, 15, tzinfo=UTC)
MISSING = object()


def candle(index, open_, high, low, close, volume=100, completed=True, minutes=5):
    row = {
        "time": (START + timedelta(minutes=index * minutes)).isoformat(),
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "completed": completed,
    }
    if volume is not MISSING:
        row["volume"] = volume
    return row


def directional_candles(closes):
    rows = []
    for index, close in enumerate(closes):
        open_ = close - 0.25 if index == 0 or close >= closes[index - 1] else close + 0.25
        rows.append(candle(index, open_, max(open_, close) + 0.5, min(open_, close) - 0.5, close))
    return rows


def test_forming_final_bar_cannot_confirm_structure_or_move_cutoff():
    rows = [
        candle(0, 100, 101, 99, 100),
        candle(1, 100, 101, 99, 100),
        candle(2, 102, 103, 100, 100.5),
        candle(3, 100.5, 108, 100, 107, completed=False),
    ]

    result = analyze_market_structure(rows, source="test")

    assert result.diagnostics.incomplete_candles_excluded == 1
    assert result.diagnostics.valid_candles == 3
    assert result.data_cutoff == rows[2]["time"]
    assert all(block.formed_at != rows[3]["time"] for block in result.order_blocks)
    assert result.quality == "PARTIAL"


def test_explicit_as_of_excludes_completed_future_candles():
    rows = directional_candles([100, 101, 102, 103, 104])
    cutoff = rows[2]["time"]

    result = analyze_market_structure(rows, as_of=cutoff)

    assert result.diagnostics.future_candles_excluded == 2
    assert result.data_cutoff == cutoff
    assert result.as_of == cutoff
    assert result.classification.label == "unavailable"


def test_invalid_candles_and_gaps_are_excluded_and_reported():
    rows = [
        candle(0, 100, 101, 99, 100),
        candle(1, 100, 101, 99, 100),
        candle(4, 100, 101, 99, 100),  # 15-minute jump after a 5-minute cadence.
        {**candle(5, 100, 99, 101, 100), "volume": 100},  # impossible OHLC.
        candle(6, 100, 101, 99, 100, completed=False),
    ]

    result = analyze_market_structure(rows, interval_seconds=300)

    assert result.diagnostics.invalid_candles == 1
    assert result.diagnostics.incomplete_candles_excluded == 1
    assert result.diagnostics.gap_count == 1
    assert result.diagnostics.gaps[0].elapsed_seconds == 900
    assert result.quality == "PARTIAL"


def test_order_block_forms_from_displacement_and_is_invalidated_by_close():
    rows = [
        candle(0, 100, 101, 99, 100),
        candle(1, 100, 101, 99, 100),
        candle(2, 102, 103, 100, 100.5),  # last bearish candle / zone [100, 103].
        candle(3, 100.5, 108, 100, 107),  # confirmed bullish displacement.
        candle(4, 107, 108, 104, 106),
    ]
    active = analyze_market_structure(rows)
    block = next(item for item in active.order_blocks if item.base_at == rows[2]["time"])
    assert block.direction == "bullish"
    assert block.lower == 100
    assert block.upper == 103
    assert block.status == "active"

    invalidated = analyze_market_structure(rows + [candle(5, 106, 107, 98, 99)])
    block = next(item for item in invalidated.order_blocks if item.base_at == rows[2]["time"])
    assert block.status == "invalidated"
    assert block.invalidated_at == (rows + [candle(5, 106, 107, 98, 99)])[5]["time"]
    assert block.invalidation_close == 99


def test_equal_highs_lows_create_proxies_and_reclaimed_wicks_are_sweeps():
    rows = [
        candle(0, 100, 105, 95, 100),
        candle(1, 100, 105, 96, 102),
        candle(2, 102, 104, 95, 101),
        candle(3, 101, 107, 99, 103),  # buy-side sweep, close back under 105.
        candle(4, 103, 104, 93, 97),  # sell-side sweep, close back over 95.
    ]

    result = analyze_market_structure(rows)

    assert {proxy.kind for proxy in result.price_liquidity_proxies} >= {"equal_high", "equal_low"}
    assert {sweep.direction for sweep in result.liquidity_sweeps} == {"bullish", "bearish"}
    assert any(sweep.proxy_kind == "equal_high" and sweep.swept_price == 107 for sweep in result.liquidity_sweeps)
    assert any(sweep.proxy_kind == "equal_low" and sweep.swept_price == 93 for sweep in result.liquidity_sweeps)


def test_missing_volume_and_depth_remain_explicitly_unavailable():
    rows = [candle(index, 100 + index, 101 + index, 99 + index, 100.5 + index, volume=MISSING) for index in range(5)]
    result = analyze_market_structure(
        rows,
        live_quote={"price": 106, "as_of": START.isoformat(), "bid": 105, "ask": 106},
    )

    assert result.volume is None
    assert result.depth_imbalance is None
    assert result.live_price == 106
    assert result.diagnostics.missing_volume_candles == 5

    with_depth = analyze_market_structure(
        rows,
        live_quote={"price": 106, "as_of": START.isoformat(), "bid_size": 120, "ask_size": 80},
    )
    assert with_depth.depth_imbalance is not None
    assert with_depth.depth_imbalance.imbalance == pytest.approx(0.2)
    assert with_depth.depth_imbalance.bias == "bullish"


def test_output_is_deterministic_and_serializable_with_metadata():
    rows = directional_candles([100, 101, 102, 103, 104])
    first = analyze_market_structure(rows, source="fixture")
    second = analyze_market_structure(list(reversed(rows)), source="fixture")

    assert first.to_dict() == second.to_dict()
    payload = first.to_dict()
    assert payload["source"] == "fixture"
    assert payload["methodology_version"] == METHODOLOGY_VERSION
    assert payload["data_cutoff"] == rows[-1]["time"]
    assert payload["quality"] == "GOOD"
    assert isinstance(payload["order_blocks"], list)


def test_rank_is_an_attention_score_with_visible_components_not_a_probability():
    rows = [
        candle(0, 100, 101, 99, 100),
        candle(1, 100, 101, 99, 100),
        candle(2, 102, 103, 100, 100.5),
        candle(3, 100.5, 108, 100, 107, volume=250),
        candle(4, 107, 109, 106, 108, volume=220),
    ]
    result = analyze_market_structure(
        rows,
        live_quote={"price": 108, "bid_size": 150, "ask_size": 50, "source": "fyers"},
    )
    rank = result.rank()
    assert rank.score is not None
    assert rank.label == result.classification.label
    assert dict(rank.components)["active_zone"] > 0
    assert dict(rank.components)["depth_imbalance"] > 0


@pytest.mark.parametrize(
    ("closes", "expected"),
    [
        ([100, 101, 102, 103, 104], "bullish"),
        ([104, 103, 102, 101, 100], "bearish"),
        ([100, 102, 99, 101, 100], "choppy"),
        ([100, 101, 102], "unavailable"),
    ],
)
def test_classification_uses_confirmed_price_structure(closes, expected):
    result = analyze_market_structure(directional_candles(closes))
    assert result.classification.label == expected

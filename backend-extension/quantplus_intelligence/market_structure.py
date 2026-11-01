"""Pure, rule-based market-structure analysis.

This module deliberately has no provider or application imports.  It accepts
already collected candles and an optional quote so it can be used by a future
adapter without coupling the rules to a broker, exchange, or frontend.

Only candles marked as completed are evidence.  A live quote may provide
current price/depth context, but it can never form or invalidate a confirmed
order block or liquidity sweep.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, fields, is_dataclass
from datetime import datetime, timezone
from math import isfinite
from statistics import median
from typing import Any, Literal, TypeAlias


METHODOLOGY_VERSION = "quantplus.market_structure.v1"

QualityStatus: TypeAlias = Literal["GOOD", "PARTIAL", "DEGRADED", "UNAVAILABLE"]
Direction: TypeAlias = Literal["bullish", "bearish"]
ClassificationLabel: TypeAlias = Literal["bullish", "bearish", "choppy", "unavailable"]


def _serialise(value: Any) -> Any:
    """Convert the frozen response tree into JSON-compatible primitives."""

    if isinstance(value, datetime):
        return value.isoformat()
    if is_dataclass(value):
        return {field.name: _serialise(getattr(value, field.name)) for field in fields(value)}
    if isinstance(value, tuple):
        return [_serialise(item) for item in value]
    if isinstance(value, list):
        return [_serialise(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _serialise(item) for key, item in value.items()}
    return value


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if isfinite(number) else None


def _timestamp(value: Any) -> datetime | None:
    """Normalize an epoch or ISO timestamp to an aware UTC datetime.

    Naive datetimes are interpreted as UTC for adapter friendliness.  No
    receipt time is introduced when an input timestamp is absent.
    """

    if isinstance(value, datetime):
        result = value
    elif isinstance(value, bool):
        return None
    elif isinstance(value, (int, float)):
        number = _number(value)
        if number is None or number < 0:
            return None
        # A millisecond epoch is common in quote adapters.
        if number > 100_000_000_000:
            number /= 1000
        try:
            result = datetime.fromtimestamp(number, timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            result = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None

    if result.tzinfo is None or result.utcoffset() is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _get(mapping: Mapping[str, Any], *names: str, default: Any = None) -> Any:
    for name in names:
        if name in mapping:
            return mapping[name]
    return default


@dataclass(frozen=True, slots=True)
class OHLCVCandle:
    """A normalized candle accepted by :func:`analyze_market_structure`."""

    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float | None = None
    completed: bool = True
    source: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _serialise(self)


@dataclass(frozen=True, slots=True)
class LiveQuote:
    """An optional current quote; quote data is never confirmed candle evidence."""

    price: float
    as_of: datetime | None = None
    bid_size: float | None = None
    ask_size: float | None = None
    source: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return _serialise(self)


@dataclass(frozen=True, slots=True)
class CandleGap:
    previous: str
    next: str
    elapsed_seconds: float
    expected_interval_seconds: float


@dataclass(frozen=True, slots=True)
class MarketStructureDiagnostics:
    input_candles: int
    valid_candles: int
    invalid_candles: int
    incomplete_candles_excluded: int
    future_candles_excluded: int
    duplicate_timestamps: int
    gap_count: int
    gaps: tuple[CandleGap, ...]
    missing_volume_candles: int
    expected_interval_seconds: float | None


@dataclass(frozen=True, slots=True)
class OrderBlockCandidate:
    direction: Direction
    lower: float
    upper: float
    base_at: str
    formed_at: str
    status: Literal["active", "invalidated"]
    invalidated_at: str | None = None
    invalidation_close: float | None = None


@dataclass(frozen=True, slots=True)
class PriceLiquidityProxy:
    kind: Literal["equal_high", "equal_low"]
    side: Literal["buy_side", "sell_side"]
    level: float
    tolerance: float
    touches: tuple[str, ...]
    formed_at: str
    last_touch_at: str


@dataclass(frozen=True, slots=True)
class LiquiditySweep:
    direction: Direction
    side: Literal["buy_side", "sell_side"]
    proxy_kind: Literal["equal_high", "equal_low"]
    liquidity_level: float
    swept_price: float
    close: float
    swept_at: str


@dataclass(frozen=True, slots=True)
class DepthImbalance:
    bid_size: float
    ask_size: float
    imbalance: float
    bias: Direction | None
    as_of: str | None
    source: str | None


@dataclass(frozen=True, slots=True)
class VolumeObservation:
    observed_candles: int
    missing_candles: int
    latest_volume: float | None
    recent_median_volume: float | None
    latest_vs_recent_median: float | None


@dataclass(frozen=True, slots=True)
class MarketClassification:
    label: ClassificationLabel
    reason: str
    evidence: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class StructureRank:
    """Deterministic attention score for board ordering, never a probability."""

    score: float | None
    components: tuple[tuple[str, float], ...]
    label: str


@dataclass(frozen=True, slots=True)
class MarketStructureResult:
    """Serializable market-structure response.

    ``data_cutoff`` is the latest completed candle used for confirmed
    structure.  ``as_of`` may be later when a timestamped live quote supplied
    current depth/price context.  The optional quote is never used to create
    a confirmed event.
    """

    source: str | None
    as_of: str | None
    data_cutoff: str | None
    methodology_version: str
    quality: QualityStatus
    quality_reasons: tuple[str, ...]
    classification: MarketClassification
    order_blocks: tuple[OrderBlockCandidate, ...]
    price_liquidity_proxies: tuple[PriceLiquidityProxy, ...]
    liquidity_sweeps: tuple[LiquiditySweep, ...]
    depth_imbalance: DepthImbalance | None
    volume: VolumeObservation | None
    diagnostics: MarketStructureDiagnostics
    live_price: float | None

    @property
    def data_quality(self) -> QualityStatus:
        """Compatibility alias for extension code using existing terminology."""

        return self.quality

    def to_dict(self) -> dict[str, Any]:
        result = _serialise(self)
        result["data_quality"] = self.quality
        return result

    def as_dict(self) -> dict[str, Any]:
        return self.to_dict()

    def rank(self) -> StructureRank:
        """Return a transparent board-order score for this observation.

        The value is deliberately an attention/ranking aid, not a forecast,
        confidence, or probability.  Missing inputs contribute nothing and
        reduce the available quality rather than becoming invented evidence.
        """

        if self.classification.label == "unavailable" or self.quality == "UNAVAILABLE":
            return StructureRank(None, (), "unavailable")

        components: list[tuple[str, float]] = []
        active_blocks = sum(block.status == "active" for block in self.order_blocks)
        if active_blocks:
            components.append(("active_zone", min(30.0, 15.0 * active_blocks)))
        if self.liquidity_sweeps:
            components.append(("liquidity_sweep", min(25.0, 12.5 * len(self.liquidity_sweeps))))
        if self.depth_imbalance is not None:
            components.append(("depth_imbalance", min(15.0, abs(self.depth_imbalance.imbalance) * 15.0)))
        if self.volume is not None and self.volume.latest_vs_recent_median is not None:
            components.append(
                (
                    "relative_volume",
                    min(15.0, max(0.0, self.volume.latest_vs_recent_median - 1.0) * 10.0),
                )
            )
        if self.quality == "GOOD":
            components.append(("data_quality", 15.0))
        elif self.quality == "PARTIAL":
            components.append(("data_quality", 7.5))

        score = round(sum(value for _, value in components), 2)
        label = self.classification.label
        return StructureRank(score, tuple(components), label)


@dataclass(frozen=True, slots=True)
class _CandleRow:
    candle: OHLCVCandle
    segment: int


@dataclass(frozen=True, slots=True)
class _ProxyRef:
    proxy: PriceLiquidityProxy
    segment: int


def _parse_candle(raw: Any) -> tuple[OHLCVCandle | None, str | None]:
    if isinstance(raw, OHLCVCandle):
        timestamp = _timestamp(raw.timestamp)
        completed = raw.completed
        values = (raw.open, raw.high, raw.low, raw.close)
        volume_value = raw.volume
        source = raw.source
    elif isinstance(raw, Mapping):
        timestamp = _timestamp(_get(raw, "bar_end", "timestamp", "time", "date"))
        completed_value = _get(raw, "completed", "is_completed", "is_complete", default=True)
        if not isinstance(completed_value, bool):
            return None, "invalid_completion_flag"
        completed = completed_value
        values = (
            _get(raw, "open", "o"),
            _get(raw, "high", "h"),
            _get(raw, "low", "l"),
            _get(raw, "close", "c"),
        )
        volume_value = _get(raw, "volume", "v", default=None)
        source = _get(raw, "source", default=None)
        if _get(raw, "forming", default=False) is True:
            completed = False
    else:
        return None, "unsupported_candle"

    if not completed:
        return None, "incomplete_candle"
    if timestamp is None:
        return None, "invalid_timestamp"
    numbers = tuple(_number(value) for value in values)
    if any(value is None or value <= 0 for value in numbers):
        return None, "invalid_ohlc"
    op, high, low, close = numbers  # type: ignore[misc]
    if high < max(op, low, close) or low > min(op, high, close):
        return None, "invalid_ohlc_relationship"

    if volume_value is None:
        volume = None
    else:
        volume = _number(volume_value)
        if volume is None or volume < 0:
            return None, "invalid_volume"
    if source is not None and not isinstance(source, str):
        source = str(source)
    return OHLCVCandle(timestamp, op, high, low, close, volume, True, source), None


def _parse_live_quote(raw: Any) -> LiveQuote | None:
    if isinstance(raw, LiveQuote):
        price = _number(raw.price)
        if price is None or price <= 0:
            return None
        as_of = _timestamp(raw.as_of) if raw.as_of is not None else None
        bid_size = _nonnegative_number(raw.bid_size)
        ask_size = _nonnegative_number(raw.ask_size)
        return LiveQuote(price, as_of, bid_size, ask_size, raw.source)
    if not isinstance(raw, Mapping):
        return None

    price = _number(_get(raw, "price", "last", "ltp", "close"))
    if price is None or price <= 0:
        return None
    as_of_value = _get(raw, "as_of", "timestamp", "time", default=None)
    as_of = _timestamp(as_of_value) if as_of_value is not None else None
    source = _get(raw, "source", default=None)
    if source is not None and not isinstance(source, str):
        source = str(source)
    depth = _get(raw, "depth", default=None)
    depth_mapping = depth if isinstance(depth, Mapping) else {}
    bid_size = _depth_size(raw, depth_mapping, "bid")
    ask_size = _depth_size(raw, depth_mapping, "ask")
    return LiveQuote(price, as_of, bid_size, ask_size, source)


def _nonnegative_number(value: Any) -> float | None:
    number = _number(value)
    return number if number is not None and number >= 0 else None


def _depth_size(
    raw: Mapping[str, Any], depth: Mapping[str, Any], side: Literal["bid", "ask"]
) -> float | None:
    names = (
        f"{side}_size",
        f"{side}_quantity",
        f"{side}_qty",
        f"{side}_volume",
    )
    value = _get(raw, *names, default=None)
    if value is None:
        value = _get(depth, *names, default=None)
    direct = _nonnegative_number(value)
    if direct is not None:
        return direct

    levels = _get(raw, f"{side}s", default=None)
    if levels is None:
        levels = _get(depth, f"{side}s", default=None)
    if not isinstance(levels, Sequence) or isinstance(levels, (str, bytes)):
        return None
    quantities: list[float] = []
    for level in levels:
        if isinstance(level, Mapping):
            quantity = _get(level, "quantity", "qty", "size", "volume", default=None)
        elif isinstance(level, Sequence) and not isinstance(level, (str, bytes)) and len(level) >= 2:
            quantity = level[1]
        else:
            quantity = None
        parsed = _nonnegative_number(quantity)
        if parsed is None:
            return None
        quantities.append(parsed)
    return sum(quantities) if quantities else None


def _segment_candles(
    candles: Sequence[OHLCVCandle], interval_seconds: float | None
) -> tuple[list[_CandleRow], tuple[CandleGap, ...], float | None]:
    if not candles:
        return [], (), None
    deltas = [
        (later.timestamp - earlier.timestamp).total_seconds()
        for earlier, later in zip(candles, candles[1:])
        if (later.timestamp - earlier.timestamp).total_seconds() > 0
    ]
    if interval_seconds is not None:
        expected = float(interval_seconds)
    elif deltas:
        # The shortest observed cadence is safer than averaging a missing bar
        # into the cadence and hiding a gap.
        expected = min(deltas)
    else:
        expected = None

    rows: list[_CandleRow] = [_CandleRow(candles[0], 0)]
    gaps: list[CandleGap] = []
    segment = 0
    for previous, current in zip(candles, candles[1:]):
        delta = (current.timestamp - previous.timestamp).total_seconds()
        if expected is not None and delta > expected * 1.5:
            gaps.append(CandleGap(_iso(previous.timestamp), _iso(current.timestamp), delta, expected))  # type: ignore[arg-type]
            segment += 1
        rows.append(_CandleRow(current, segment))
    return rows, tuple(gaps), expected


def _range(candle: OHLCVCandle) -> float:
    return candle.high - candle.low


def _body(candle: OHLCVCandle) -> float:
    return abs(candle.close - candle.open)


def _order_blocks(rows: Sequence[_CandleRow]) -> tuple[OrderBlockCandidate, ...]:
    result: list[OrderBlockCandidate] = []
    by_segment: dict[int, list[OHLCVCandle]] = {}
    for row in rows:
        by_segment.setdefault(row.segment, []).append(row.candle)

    for segment_candles in by_segment.values():
        for index in range(1, len(segment_candles)):
            base = segment_candles[index - 1]
            impulse = segment_candles[index]
            prior_ranges = [_range(item) for item in segment_candles[max(0, index - 4) : index]]
            baseline = median(prior_ranges) if prior_ranges else _range(base)
            impulse_range = _range(impulse)
            if baseline <= 0 or impulse_range <= 0:
                continue
            strong_body = _body(impulse) >= impulse_range * 0.60
            strong_range = impulse_range >= baseline * 1.25

            if base.close < base.open and impulse.close > base.high and strong_body and strong_range:
                direction: Direction = "bullish"
            elif base.close > base.open and impulse.close < base.low and strong_body and strong_range:
                direction = "bearish"
            else:
                continue

            invalidated_at: str | None = None
            invalidation_close: float | None = None
            for later in segment_candles[index + 1 :]:
                invalidated = (
                    later.close < base.low if direction == "bullish" else later.close > base.high
                )
                if invalidated:
                    invalidated_at = _iso(later.timestamp)
                    invalidation_close = later.close
                    break
            result.append(
                OrderBlockCandidate(
                    direction=direction,
                    lower=base.low,
                    upper=base.high,
                    base_at=_iso(base.timestamp),  # type: ignore[arg-type]
                    formed_at=_iso(impulse.timestamp),  # type: ignore[arg-type]
                    status="invalidated" if invalidated_at else "active",
                    invalidated_at=invalidated_at,
                    invalidation_close=invalidation_close,
                )
            )
    return tuple(result)


def _cluster_proxies(
    rows: Sequence[_CandleRow], equal_tolerance: float
) -> tuple[_ProxyRef, ...]:
    references: list[_ProxyRef] = []
    by_segment: dict[int, list[OHLCVCandle]] = {}
    for row in rows:
        by_segment.setdefault(row.segment, []).append(row.candle)

    for segment, segment_candles in by_segment.items():
        for kind, side, attribute in (
            ("equal_high", "buy_side", "high"),
            ("equal_low", "sell_side", "low"),
        ):
            clusters: list[list[tuple[float, OHLCVCandle]]] = []
            for candle in segment_candles:
                value = getattr(candle, attribute)
                matching: list[tuple[float, int]] = []
                for cluster_index, cluster in enumerate(clusters):
                    center = sum(item[0] for item in cluster) / len(cluster)
                    tolerance = max(abs(center) * equal_tolerance, 1e-12)
                    if abs(value - center) <= tolerance:
                        matching.append((abs(value - center), cluster_index))
                if matching:
                    _, selected = min(matching)
                    clusters[selected].append((value, candle))
                else:
                    clusters.append([(value, candle)])

            for cluster in clusters:
                if len(cluster) < 2:
                    continue
                touch_candles = sorted((item[1] for item in cluster), key=lambda item: item.timestamp)
                level = sum(item[0] for item in cluster) / len(cluster)
                tolerance = max(abs(level) * equal_tolerance, 1e-12)
                proxy = PriceLiquidityProxy(
                    kind=kind,  # type: ignore[arg-type]
                    side=side,  # type: ignore[arg-type]
                    level=level,
                    tolerance=tolerance,
                    touches=tuple(_iso(item.timestamp) for item in touch_candles),  # type: ignore[arg-type]
                    formed_at=_iso(touch_candles[-1].timestamp),  # type: ignore[arg-type]
                    last_touch_at=_iso(touch_candles[-1].timestamp),  # type: ignore[arg-type]
                )
                references.append(_ProxyRef(proxy, segment))

    return tuple(
        sorted(
            references,
            key=lambda item: (item.proxy.formed_at, item.proxy.kind, item.proxy.level),
        )
    )


def _liquidity_sweeps(
    rows: Sequence[_CandleRow], proxies: Sequence[_ProxyRef]
) -> tuple[LiquiditySweep, ...]:
    result: list[LiquiditySweep] = []
    for reference in proxies:
        proxy = reference.proxy
        eligible = [
            row.candle
            for row in rows
            if row.segment == reference.segment and row.candle.timestamp > _timestamp(proxy.formed_at)  # type: ignore[arg-type]
        ]
        for candle in eligible:
            if proxy.kind == "equal_high":
                swept = candle.high > proxy.level + proxy.tolerance and candle.close <= proxy.level
                direction: Direction = "bearish"
            else:
                swept = candle.low < proxy.level - proxy.tolerance and candle.close >= proxy.level
                direction = "bullish"
            if swept:
                result.append(
                    LiquiditySweep(
                        direction=direction,
                        side=proxy.side,
                        proxy_kind=proxy.kind,
                        liquidity_level=proxy.level,
                        swept_price=candle.high if proxy.kind == "equal_high" else candle.low,
                        close=candle.close,
                        swept_at=_iso(candle.timestamp),  # type: ignore[arg-type]
                    )
                )
    return tuple(sorted(result, key=lambda item: (item.swept_at, item.proxy_kind, item.liquidity_level)))


def _volume_observation(candles: Sequence[OHLCVCandle]) -> VolumeObservation | None:
    observed = [candle.volume for candle in candles if candle.volume is not None]
    if not observed:
        return None
    latest = candles[-1].volume if candles else None
    prior = [candle.volume for candle in candles[:-1] if candle.volume is not None]
    recent_median = median(prior) if prior else None
    ratio = latest / recent_median if latest is not None and recent_median and recent_median > 0 else None
    return VolumeObservation(
        observed_candles=len(observed),
        missing_candles=len(candles) - len(observed),
        latest_volume=latest,
        recent_median_volume=recent_median,
        latest_vs_recent_median=ratio,
    )


def _classify(
    rows: Sequence[_CandleRow], sweeps: Sequence[LiquiditySweep]
) -> MarketClassification:
    if not rows:
        return MarketClassification("unavailable", "No validated completed candles", ("no_completed_candles",))
    last_segment = max(row.segment for row in rows)
    candles = [row.candle for row in rows if row.segment == last_segment]
    if len(candles) < 4:
        return MarketClassification(
            "unavailable",
            "Fewer than four candles in the latest contiguous segment",
            ("latest_segment_too_short", "completed_candles_only"),
        )

    recent = candles[-6:]
    moves = [current.close - previous.close for previous, current in zip(recent, recent[1:])]
    up = sum(move > 0 for move in moves)
    down = sum(move < 0 for move in moves)
    net = recent[-1].close - recent[0].close
    scale = max(recent[0].close * 0.001, 1e-12)
    monotonic_up = all(move >= 0 for move in moves) and any(move > 0 for move in moves)
    monotonic_down = all(move <= 0 for move in moves) and any(move < 0 for move in moves)

    recent_start = recent[0].timestamp
    bullish_sweep = any(
        item.direction == "bullish" and _timestamp(item.swept_at) is not None and _timestamp(item.swept_at) >= recent_start
        for item in sweeps
    )
    bearish_sweep = any(
        item.direction == "bearish" and _timestamp(item.swept_at) is not None and _timestamp(item.swept_at) >= recent_start
        for item in sweeps
    )

    bullish = monotonic_up or (net > scale and up > down) or (bullish_sweep and not bearish_sweep)
    bearish = monotonic_down or (net < -scale and down > up) or (bearish_sweep and not bullish_sweep)
    if bullish and not bearish:
        reason = "Recent completed closes make higher progress"
        evidence = ("completed_candles_only", "latest_contiguous_segment", f"up_moves={up}", f"down_moves={down}")
        if bullish_sweep:
            reason = "A recent sell-side liquidity sweep reclaimed the level"
            evidence = evidence + ("bullish_liquidity_sweep",)
        return MarketClassification("bullish", reason, evidence)
    if bearish and not bullish:
        reason = "Recent completed closes make lower progress"
        evidence = ("completed_candles_only", "latest_contiguous_segment", f"up_moves={up}", f"down_moves={down}")
        if bearish_sweep:
            reason = "A recent buy-side liquidity sweep rejected the level"
            evidence = evidence + ("bearish_liquidity_sweep",)
        return MarketClassification("bearish", reason, evidence)
    return MarketClassification(
        "choppy",
        "Confirmed price action has no single directional rule",
        ("completed_candles_only", "latest_contiguous_segment", f"up_moves={up}", f"down_moves={down}"),
    )


def _quality(
    valid_count: int,
    invalid_count: int,
    incomplete_count: int,
    future_count: int,
    duplicate_count: int,
    gap_count: int,
    missing_volume: int,
) -> tuple[QualityStatus, tuple[str, ...]]:
    if valid_count == 0:
        reasons = ["NO_VALID_COMPLETED_CANDLES"]
    else:
        reasons = []
        if invalid_count:
            reasons.append("INVALID_CANDLES_EXCLUDED")
        if incomplete_count:
            reasons.append("FORMING_CANDLES_EXCLUDED")
        if future_count:
            reasons.append("FUTURE_CANDLES_EXCLUDED")
        if duplicate_count:
            reasons.append("DUPLICATE_TIMESTAMPS_EXCLUDED")
        if gap_count:
            reasons.append("CANDLE_GAPS_DETECTED")
        if missing_volume:
            reasons.append("VOLUME_PARTIAL_OR_UNAVAILABLE")

    defects = invalid_count or incomplete_count or future_count or duplicate_count or gap_count or missing_volume
    if valid_count == 0:
        status: QualityStatus = "UNAVAILABLE"
    elif defects:
        status = "PARTIAL"
    elif valid_count < 4:
        status = "DEGRADED"
    else:
        status = "GOOD"
    return status, tuple(reasons)


def analyze_market_structure(
    candles: Sequence[OHLCVCandle | Mapping[str, Any]],
    live_quote: LiveQuote | Mapping[str, Any] | None = None,
    *,
    source: str | None = None,
    as_of: datetime | str | float | int | None = None,
    interval_seconds: float | None = None,
    equal_tolerance: float = 0.001,
    methodology_version: str = METHODOLOGY_VERSION,
) -> MarketStructureResult:
    """Analyze validated completed OHLCV candles without provider access.

    Rules are intentionally conservative and inspect only the latest
    contiguous candle segments:

    * A bullish/bearish order block is the last opposite-colored candle before
      a body-dominant displacement close beyond that candle's extreme.  It is
      invalidated only by a later completed close through the zone.
    * Equal highs/lows within ``equal_tolerance`` are price-liquidity proxies.
      A sweep requires a later completed wick beyond the proxy and a close back
      through the level.
    * Depth imbalance is ``(bid - ask) / (bid + ask)`` when both top-of-book
      quantities are present and the denominator is nonzero.
    * Classification uses only completed closes in the latest contiguous
      segment.  A live quote is context, never confirmation.
    """

    if interval_seconds is not None:
        interval = _number(interval_seconds)
        if interval is None or interval <= 0:
            raise ValueError("interval_seconds must be a positive finite number")
        interval_seconds = interval
    tolerance = _number(equal_tolerance)
    if tolerance is None or tolerance <= 0:
        raise ValueError("equal_tolerance must be a positive finite number")

    input_items = list(candles or [])
    explicit_as_of = _timestamp(as_of) if as_of is not None else None
    invalid_as_of = as_of is not None and explicit_as_of is None
    parsed: list[OHLCVCandle] = []
    invalid_count = 0
    incomplete_count = 0
    future_count = 0
    sources: set[str] = set()
    for item in input_items:
        candle, reason = _parse_candle(item)
        if reason == "incomplete_candle":
            incomplete_count += 1
            continue
        if candle is None:
            invalid_count += 1
            continue
        if explicit_as_of is not None and candle.timestamp > explicit_as_of:
            future_count += 1
            continue
        parsed.append(candle)
        if candle.source:
            sources.add(candle.source)

    by_timestamp: dict[datetime, list[OHLCVCandle]] = {}
    for candle in parsed:
        by_timestamp.setdefault(candle.timestamp, []).append(candle)
    duplicate_count = sum(len(items) for items in by_timestamp.values() if len(items) > 1)
    parsed = [items[0] for timestamp, items in sorted(by_timestamp.items()) if len(items) == 1]
    rows, gaps, expected_interval = _segment_candles(parsed, interval_seconds)
    completed = [row.candle for row in rows]
    missing_volume = sum(candle.volume is None for candle in completed)

    quote = _parse_live_quote(live_quote) if live_quote is not None else None
    if quote is not None and explicit_as_of is not None and quote.as_of is not None and quote.as_of > explicit_as_of:
        quote = None
    if quote is not None and quote.source:
        sources.add(quote.source)
    if source is not None:
        response_source = source
    elif len(sources) == 1:
        response_source = next(iter(sources))
    elif len(sources) > 1:
        response_source = "mixed"
    else:
        response_source = None

    latest_candle = completed[-1].timestamp if completed else None
    quote_as_of = quote.as_of if quote is not None else None
    data_cutoff_dt = max((value for value in (latest_candle, quote_as_of) if value is not None), default=None)
    observed_as_of = explicit_as_of or data_cutoff_dt
    if invalid_as_of:
        # Keep the metadata explicit instead of presenting a malformed caller
        # timestamp as a trustworthy observation time.
        observed_as_of = data_cutoff_dt

    quality, quality_reasons = _quality(
        len(completed),
        invalid_count,
        incomplete_count,
        future_count,
        duplicate_count,
        len(gaps),
        missing_volume,
    )
    order_blocks = _order_blocks(rows)
    proxy_refs = _cluster_proxies(rows, tolerance)
    proxies = tuple(reference.proxy for reference in proxy_refs)
    sweeps = _liquidity_sweeps(rows, proxy_refs)
    classification = _classify(rows, sweeps)
    volume = _volume_observation(completed)

    depth = None
    if quote is not None and quote.bid_size is not None and quote.ask_size is not None:
        denominator = quote.bid_size + quote.ask_size
        if denominator > 0:
            imbalance = (quote.bid_size - quote.ask_size) / denominator
            bias: Direction | None = "bullish" if imbalance > 0 else "bearish" if imbalance < 0 else None
            depth = DepthImbalance(
                bid_size=quote.bid_size,
                ask_size=quote.ask_size,
                imbalance=imbalance,
                bias=bias,
                as_of=_iso(quote.as_of),
                source=quote.source,
            )

    diagnostics = MarketStructureDiagnostics(
        input_candles=len(input_items),
        valid_candles=len(completed),
        invalid_candles=invalid_count,
        incomplete_candles_excluded=incomplete_count,
        future_candles_excluded=future_count,
        duplicate_timestamps=duplicate_count,
        gap_count=len(gaps),
        gaps=gaps,
        missing_volume_candles=missing_volume,
        expected_interval_seconds=expected_interval,
    )
    return MarketStructureResult(
        source=response_source,
        as_of=_iso(observed_as_of),
        data_cutoff=_iso(latest_candle),
        methodology_version=methodology_version,
        quality=quality,
        quality_reasons=quality_reasons,
        classification=classification,
        order_blocks=order_blocks,
        price_liquidity_proxies=proxies,
        liquidity_sweeps=sweeps,
        depth_imbalance=depth,
        volume=volume,
        diagnostics=diagnostics,
        live_price=quote.price if quote is not None else None,
    )


analyze = analyze_market_structure


__all__ = [
    "METHODOLOGY_VERSION",
    "OHLCVCandle",
    "LiveQuote",
    "CandleGap",
    "MarketStructureDiagnostics",
    "OrderBlockCandidate",
    "PriceLiquidityProxy",
    "LiquiditySweep",
    "DepthImbalance",
    "VolumeObservation",
    "MarketClassification",
    "StructureRank",
    "MarketStructureResult",
    "analyze_market_structure",
    "analyze",
]

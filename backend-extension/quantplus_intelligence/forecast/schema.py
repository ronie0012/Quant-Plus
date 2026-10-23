"""Forecast Card: a probability, a range and an honest abstention instead of BUY/SELL."""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field

AUTHORITY = "RESEARCH_ONLY"
HORIZONS = (5, 20)
BENCHMARKS = ("NIFTY50", "SECTOR")
QUANTILES = (0.1, 0.5, 0.9)
MODEL_VERSION = "forecast-v1"


@dataclass(frozen=True)
class Contribution:
    """One forecaster's calibrated vote inside the aggregate."""
    forecaster: str
    p: float
    weight: float
    raw_p: float | None = None
    note: str = ""


@dataclass(frozen=True)
class ForecastCard:
    symbol: str
    as_of: str                      # ISO UTC evidence cutoff; nothing later may be used
    horizon: int                    # trading sessions
    benchmark: str
    p_outperform: float | None      # None only when abstaining
    quantiles: dict[str, float]     # excess-return quantiles over the horizon, e.g. {"0.1": -0.04}
    vol_forecast: float | None      # horizon return standard deviation
    p_event_shock: float | None
    abstain: bool = False
    abstain_reason: str = ""
    contributions: tuple[Contribution, ...] = ()
    disagreement: float | None = None
    robustness: float | None = None
    blind: bool = True
    falsifiers: tuple[str, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    model_version: str = MODEL_VERSION
    authority: str = field(default=AUTHORITY)

    def __post_init__(self):
        if self.authority != AUTHORITY:
            raise ValueError("Forecast authority is code-owned and must be RESEARCH_ONLY")
        if self.horizon not in HORIZONS:
            raise ValueError(f"horizon must be one of {HORIZONS}")
        if self.benchmark not in BENCHMARKS:
            raise ValueError(f"benchmark must be one of {BENCHMARKS}")
        if self.abstain:
            if not self.abstain_reason:
                raise ValueError("an abstention must state its reason")
        elif self.p_outperform is None or not 0.0 <= self.p_outperform <= 1.0:
            raise ValueError("p_outperform must be within [0, 1] unless abstaining")
        if self.p_event_shock is not None and not 0.0 <= self.p_event_shock <= 1.0:
            raise ValueError("p_event_shock must be within [0, 1]")
        values = [self.quantiles[k] for k in sorted(self.quantiles, key=float)]
        if any(b < a for a, b in zip(values, values[1:])):
            raise ValueError("quantiles must be non-decreasing")

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def card_id(self) -> str:
        """Content address: identical forecasts share one id, any change mints a new one."""
        return hashlib.sha256(canonical(self.to_dict()).encode()).hexdigest()[:24]


def canonical(payload) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def card_from_dict(data: dict) -> ForecastCard:
    data = dict(data)
    data["contributions"] = tuple(Contribution(**c) for c in data.get("contributions", ()))
    for key in ("falsifiers", "evidence_refs"):
        data[key] = tuple(data.get(key, ()))
    return ForecastCard(**data)

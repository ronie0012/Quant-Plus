from __future__ import annotations

import math
from pydantic_settings import BaseSettings, SettingsConfigDict


class IntelligenceSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_prefix="INTELLIGENCE_")
    news_ttl_seconds: int = 600
    market_ttl_seconds: int = 45
    closed_market_ttl_seconds: int = 300
    failure_ttl_seconds: int = 30
    provider_timeout_seconds: float = 8
    relevance_threshold: float = 55
    duplicate_threshold: float = .88
    news_half_life_hours: float = 12
    max_article_age_hours: float = 48
    max_news_items: int = 20
    ai_enabled: bool = True
    ai_timeout_seconds: float = 18
    ai_ttl_seconds: int = 600
    sentiment_history_interval_seconds: int = 300
    sentiment_history_max_snapshots: int = 2000
    history_range_max_days: int = 5
    dynamic_weights_enabled: bool = False
    persistence_enabled: bool = False
    # Durable local SQLite sentiment history; empty keeps history in memory.
    history_path: str = ""
    # Durable append-only raw news archive (SQLite); empty disables archiving.
    news_archive_path: str = ""
    maturation_enabled: bool = True
    scheduler_enabled: bool = True
    snapshot_history_calls: int = 6
    stream_warm_wait_seconds: float = 2
    daily_history_ttl_seconds: int = 21600
    intraday_baseline_ttl_seconds: int = 21600
    market_holidays: list[str] = []
    market_weights: dict[str, float] = {
        "nifty_momentum": .20, "market_breadth": .20, "sector_breadth": .15,
        "india_vix": .15, "news_sentiment": .15, "volume_momentum": .10, "bank_nifty": .05,
    }

    def model_post_init(self, __context):
        expected = {"nifty_momentum", "market_breadth", "sector_breadth", "india_vix",
                    "news_sentiment", "volume_momentum", "bank_nifty"}
        if set(self.market_weights) != expected or any(
                not math.isfinite(v) or v <= 0 for v in self.market_weights.values()):
            raise ValueError("Market weights must contain all seven positive finite weights")
        if not math.isclose(sum(self.market_weights.values()), 1, abs_tol=1e-9):
            raise ValueError("Market sentiment weights must total 1.0")
        if min(self.news_ttl_seconds, self.market_ttl_seconds, self.failure_ttl_seconds,
                self.provider_timeout_seconds, self.news_half_life_hours, self.ai_timeout_seconds,
                self.sentiment_history_interval_seconds, self.sentiment_history_max_snapshots,
                self.history_range_max_days) <= 0:
            raise ValueError("Timeouts, TTLs and half-life must be positive")
        if not 0 <= self.relevance_threshold <= 100 or not 0 < self.duplicate_threshold <= 1:
            raise ValueError("Invalid analysis thresholds")
        if not 0 <= self.stream_warm_wait_seconds <= 5 or not 0 <= self.snapshot_history_calls <= 20:
            raise ValueError("Stream warm wait and snapshot history budget must be bounded")


config = IntelligenceSettings()

# Scoring calibration, not current market values. All tunable factors live here.
RULES = {
    "momentum_pct_scale": 2.5, "open_pct_scale": 2.0, "vix_pct_scale": 10,
    "vix_average_scale": 30, "unchanged_pct": .02, "min_breadth_coverage": .80,
    "quote_open_max_age_seconds": 120, "quote_closed_max_age_days": 5,
    "min_market_news_articles": 3, "min_sector_count": 4,
    "divergence_pct": .75, "reaction_pct": 1, "min_volume_samples": 10,
    "max_market_article_share": .35, "news_confidence_sample_size": 5,
    "high_volatility_pct": 5, "vix_sharp_change_pct": 3, "low_volatility_score": 75,
    "risk_on_min_score": 60, "risk_off_max_score": 40,
    "trend_change_threshold": 2, "strong_trend_change_threshold": 8,
    "fast_velocity_change": 6, "slow_velocity_change": 2,
    "min_breadth_metric_coverage": .80, "near_session_level_pct": .005,
    "alignment_strong_confirmation": 85, "alignment_confirmation": 70,
    "alignment_mixed": 55, "alignment_conflicted": 35,
    "min_signal_coverage": .50, "min_reliability_observations": 30,
    "quality_good": 85, "quality_partial": 60,
    "min_baseline_sessions": 5, "min_daily_volume_sessions": 15,
    "volume_confirmation_rvol": 1.0, "volume_weak_rvol": .8,
    "volume_min_elapsed": .1, "max_rvol_weight": 3,
    "trend_tolerance_seconds": 420, "calibration_tolerance_seconds": 60,
    "component_divergence_gap": 20, "bank_divergence_pct": 1.5,
    "neutral_return_pct": .15, "reliability_bullish_score": 70, "reliability_bearish_score": 30,
    "sector_weights": {"momentum": .60, "breadth": .25, "news": .10, "volume": .05},
    "dynamic_max_multiplier": 1.25,
    "dynamic_adjustments": {"HIGH_VOLATILITY": {"india_vix": .03, "market_breadth": .02, "news_sentiment": .01},
        "STRONG_TREND": {"nifty_momentum": .03, "market_breadth": .02}},
    "confidence_divergence_penalty": {"HIGH": .08, "MEDIUM": .035, "LOW": .015},
    "quality_weights": {"market_data": .22, "breadth": .18, "volume": .1, "sectors": .15, "vix": .15, "news": .15, "freshness": .05},
}
INDEX_SYMBOLS = {
    "NIFTY": "NSE:NIFTY50-INDEX", "BANK": "NSE:NIFTYBANK-INDEX",
    "VIX": "NSE:INDIAVIX-INDEX", "IT": "NSE:NIFTYIT-INDEX",
    "AUTO": "NSE:NIFTYAUTO-INDEX", "PHARMA": "NSE:NIFTYPHARMA-INDEX",
    "FMCG": "NSE:NIFTYFMCG-INDEX", "METAL": "NSE:NIFTYMETAL-INDEX",
    "ENERGY": "NSE:NIFTYENERGY-INDEX", "REALTY": "NSE:NIFTYREALTY-INDEX",
}
MARKET_QUERIES = (
    "Indian stock market", "Nifty 50 market", "Indian economy stock market",
    "RBI markets", "Bank Nifty", "India FII DII market",
)
CATEGORY_PATTERNS = {
    "fraud/governance": r"fraud|scam|governance|embezzl|accounting irregular",
    "earnings": r"earnings|quarterly|net profit|net loss|results|q[1-4]",
    "guidance": r"guidance|outlook|forecast",
    "order/deal": r"order win|wins? (?:a )?(?:new |major )?order|contract|deal|partnership",
    "merger/acquisition": r"merger|acqui[rs]|takeover|buyout",
    "regulation": r"sebi|regulat|penalty|ban(?:ned)?|compliance",
    "management": r"ceo|chairman|resign|appoint|leadership",
    "litigation": r"lawsuit|litigat|court|legal dispute",
    "government-policy": r"rbi|policy|budget|tax|tariff|government",
    "macroeconomic": r"inflation|gdp|economy|interest rate|rate cut|rate hike",
    "commodity": r"crude|oil price|metal price|commodity|gold price",
    "analyst-rating": r"upgrade|downgrade|target price|price target|buy rating|sell rating",
    "dividend": r"dividend", "corporate-action": r"stock split|buyback|demerger|bonus share",
    "fundraising": r"fundrais|raise.*capital|qip|rights issue|bond issue",
    "product": r"launch|product|rollout", "expansion": r"expan|new plant|new factory|capacity",
    "geopolitical": r"war|conflict|sanction|geopolit|ceasefire",
    "sector": r"sector|industry",
}
CATEGORY_IMPORTANCE = {
    "earnings": 85, "guidance": 80, "fraud/governance": 95, "regulation": 80,
    "merger/acquisition": 85, "litigation": 75, "order/deal": 70,
    "government-policy": 75, "macroeconomic": 70, "geopolitical": 75,
    "management": 65, "fundraising": 65, "corporate-action": 60,
    "dividend": 45, "analyst-rating": 50, "commodity": 65, "product": 45,
    "expansion": 60, "sector": 45, "other": 25,
}
SOURCE_CREDIBILITY = {
    "reuters": .95, "bloomberg": .95, "economic times": .85, "business standard": .85,
    "mint": .85, "moneycontrol": .80, "cnbc": .85, "financial express": .80,
    "the hindu": .85, "businessline": .85, "ndtv": .75, "times of india": .75,
}

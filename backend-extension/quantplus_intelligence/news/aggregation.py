from __future__ import annotations

import math
from datetime import datetime
from ..common import label, number, utcnow
from ..config import config, RULES


def article_weight(article, now=None):
    age = max(0, ((now or utcnow()) - datetime.fromisoformat(article["published_at"])).total_seconds() / 3600)
    decay = math.exp(-math.log(2) * age / config.news_half_life_hours)
    return (article["relevance_score"] / 100) * (.1 + .9 * article["impact_score"] / 100) * article["confidence"] * decay


def aggregate(articles, symbol, quote=None, now=None, market=False):
    now = now or utcnow()
    relevant = [a for a in articles if a["relevance_score"] >= config.relevance_threshold
                and a.get("influences_sentiment", True) and a.get("language", "en") == "en"
                and number(a.get("sentiment_score")) is not None and (number(a.get("confidence")) or 0) > 0]
    weights = [article_weight(a, now) for a in relevant]
    if market and weights:
        # Winsorise article weights to cap dominance from one story in a market feed.
        cap = max(RULES["max_market_article_share"], 1 / len(weights))
        for _ in range(30):
            total = sum(weights)
            weights = [min(w, total * cap) for w in weights]
    total = sum(weights)
    score = round(sum(a["sentiment_score"] * w for a, w in zip(relevant, weights)) / total) if total else None
    sample = min(1, len(relevant) / RULES["news_confidence_sample_size"])
    confidence = (sum(a["confidence"] * w for a, w in zip(relevant, weights)) / total * sample) if total else 0
    if total:
        freshness = sum(w * math.exp(-math.log(2) * max(0, (now-datetime.fromisoformat(a["published_at"])).total_seconds()/3600)
                                    / config.news_half_life_hours) for a, w in zip(relevant, weights)) / total
        confidence *= freshness
    direction = quote.get("change_pct") if quote else None
    price_confirmation = None
    divergence = False
    if direction is not None and score is not None and (score >= 60 or score <= 40):
        price_confirmation = direction > 0 if score >= 60 else direction < 0
        divergence = not price_confirmation and abs(direction) >= RULES["divergence_pct"]
    return {
        "symbol": symbol, "score": score, "news_sentiment_score": score, "label": label(score),
        "confidence": round(confidence, 3), "positive_articles": sum(a["sentiment"] == "positive" for a in relevant),
        "neutral_articles": sum(a["sentiment"] == "neutral" for a in relevant),
        "negative_articles": sum(a["sentiment"] == "negative" for a in relevant),
        "high_impact_articles": sum(a["impact"] == "high" for a in relevant),
        "price_confirmation": price_confirmation, "news_price_divergence": divergence,
        "top_drivers": sorted(relevant, key=lambda a: article_weight(a, now), reverse=True)[:5],
        "data_quality": "PARTIAL" if relevant else "DEGRADED", "updated_at": now.isoformat(),
        "methodology": "relevance × impact × confidence × exponential recency decay; headline rules v1",
    }

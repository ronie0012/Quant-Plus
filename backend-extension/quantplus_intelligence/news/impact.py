from __future__ import annotations

import re
from datetime import datetime
from ..common import clamp, utcnow
from ..config import CATEGORY_IMPORTANCE, SOURCE_CREDIBILITY


def impact(article, quote=None, now=None):
    source = article["source"].lower()
    credibility = next((v for k, v in SOURCE_CREDIBILITY.items() if k in source), .5)
    age = max(0, ((now or utcnow()) - datetime.fromisoformat(article["published_at"])).total_seconds() / 3600)
    importance = CATEGORY_IMPORTANCE[article["category"]]
    magnitude = 10 if re.search(r"\b(?:billion|crore|record|unexpected|surprise|major)\b|\d+\s*%", article["title"], re.I) else 0
    # The stock's own same-day move is never an input: it would let the price validate the
    # very score that is meant to explain it, and it mixes pre-publication movement.
    score = round(clamp(importance * .55 + credibility * 15 + article["relevance_score"] * .15
                        + max(0, 10 - age / 3) + magnitude))
    result = {"impact_score": score, "impact": "high" if score >= 70 else "medium" if score >= 35 else "low",
              "source_credibility": credibility,
              "impact_method": "prior importance, credibility, relevance, recency and stated magnitude; no price input"}
    if quote and quote.get("change_pct") is not None:
        result["price_context"] = {"day_change_pct": quote.get("change_pct"),
                                   "attributable_to_article": False,
                                   "note": "Whole-session change since the previous close; not an event reaction"}
    return result

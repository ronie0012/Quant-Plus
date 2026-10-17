from __future__ import annotations

import re
from datetime import datetime
from ..common import clamp, utcnow


def mentions(text, phrase):
    return bool(re.search(r"(?<![a-z0-9])" + re.escape(phrase.lower()) + r"(?![a-z0-9])", text.lower()))


DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def language(text):
    """Script-level language label; Hindi text is detected, not translated or scored."""
    devanagari = len(DEVANAGARI.findall(text or ""))
    latin = len(re.findall(r"[A-Za-z]", text or ""))
    if devanagari and latin:
        return "mixed"
    return "hi" if devanagari else "en"


def relevance(article, company, now=None):
    now = now or utcnow()
    title, snippet = article["title"], article.get("snippet", "")
    if company.symbol == "MARKET":
        india = bool(re.search(r"\bindia[n]?\b|\bnifty\b|\bsensex\b|\brbi\b|\bnse\b|\bbse\b", title, re.I))
        financial = bool(re.search(r"market|stock|econom|inflation|rate|fii|dii|rbi|nifty|sensex|sebi", title, re.I))
        score = 75 if india and financial else 35 if india else 0
    else:
        exact = mentions(title, company.company)
        symbol = mentions(title, company.symbol)
        alias = any(mentions(title, a) for a in company.aliases)
        body = mentions(snippet, company.company) or mentions(snippet, company.symbol)
        sector = company.sector != "unknown" and mentions(title, company.sector)
        score = 85 if exact else 75 if symbol else 65 if alias else 45 if body else 25 if sector else 0
        # Broad roundup/listicles receive less company specificity.
        if re.search(r"stocks to (?:watch|buy)|top \d+|these stocks|among.*stocks", title, re.I):
            score -= 15
        # A different listed namesake without the full company name is not company evidence.
        if not exact and any(mentions(title, name) for name in company.namesakes):
            score = min(score, 25)
    age = max(0, (now - datetime.fromisoformat(article["published_at"])).total_seconds() / 3600)
    return round(clamp(score - min(20, age / 3)), 2)

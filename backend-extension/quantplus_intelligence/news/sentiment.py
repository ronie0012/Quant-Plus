"""Conservative stock-perspective rules. Unresolved context lowers confidence."""
from __future__ import annotations

import re
from ..config import CATEGORY_PATTERNS
from ..common import clamp
from .relevance import mentions

POSITIVE = (
    r"profit.*(?:rises?|jumps?|surges?|grows?|up|increase)", r"(?:rises?|jumps?|surges?).*profit",
    r"beats?.*(?:estimate|expectation)", r"record (?:profit|revenue|order)",
    r"wins?.*(?:order|contract)", r"upgrad", r"raises?.*(?:guidance|target)",
    r"(?:shares?|stocks?).*(?:rall|surge|gain|jump|rise|climb)", r"ceasefire",
    r"(?:inflation|vix|volatility).*(?:eases?|falls?|declines?)", r"rate cuts?",
    r"(?:fii|dii|foreign investors).*(?:buy|inflow)",
)
NEGATIVE = (
    r"profit.*(?:falls?|drops?|slumps?|down|decline)", r"(?:falls?|drops?).*profit",
    r"misses?.*(?:estimate|expectation)", r"net loss|loss widens", r"downgrad",
    r"cuts?.*(?:guidance|target)", r"fraud|scam|probe|penalty|lawsuit|default|bankrupt",
    r"(?:shares?|stocks?).*(?:slump|fall|drop|plunge|decline|crash)", r"war|escalat",
    r"(?:inflation|vix|volatility).*(?:rises?|surges?|jumps?)", r"rate hikes?",
    r"(?:fii|dii|foreign investors).*(?:sell|outflow)",
)


def category(title):
    return next((name for name, pattern in CATEGORY_PATTERNS.items() if re.search(pattern, title, re.I)), "other")


def analyze(article, company):
    # Titles are substantially more reliable than snippets assembled from RSS link lists.
    text = article["title"].lower()
    positive = sum(bool(re.search(p, text)) for p in POSITIVE)
    negative = sum(bool(re.search(p, text)) for p in NEGATIVE)
    reasons = []
    oil_move = re.search(r"(?:oil|crude)(?: prices?)?.{0,35}\b(fall\w*|drop\w*|declin\w*|slump\w*|ris\w*|surg\w*|jump\w*)", text)
    if oil_move and company.business_role in ("oil_producer", "oil_consumer"):
        falling = oil_move[1].startswith(("fall", "drop", "declin", "slump"))
        beneficial = falling == (company.business_role == "oil_consumer")
        positive, negative = (1, 0) if beneficial else (0, 1)
        reasons.append(f"Oil cost/revenue sensitivity: {company.business_role}")
    elif oil_move and company.symbol != "MARKET":
        # Integrated oil businesses have competing effects; do not assume one exposure.
        positive = negative = 0
        reasons.append("Commodity exposure is ambiguous")
    # Question/speculation/negation headlines do not establish a realised catalyst.
    uncertain = bool(re.search(r"\?|\bcould\b|\bmay\b|\bmight\b|\bnot\b|\bdenies?\b|\brumou?r", text))
    direct = company.symbol == "MARKET" or mentions(text, company.company) or mentions(text, company.symbol)
    conflict = positive > 0 and negative > 0
    confidence = .72 if positive + negative else .25
    if not direct:
        confidence *= .7
    if uncertain:
        confidence *= .45
    if conflict:
        confidence *= .5
        reasons.append("Conflicting headline signals")
    direction = clamp((positive - negative) * 28, -45, 45)
    score = round(50 + direction * confidence)
    sentiment = "positive" if score >= 56 else "negative" if score <= 44 else "neutral"
    return {"sentiment": sentiment, "sentiment_score": score, "confidence": round(confidence, 3),
            "category": category(text), "sentiment_method": "stock_context_rules_v1",
            "analysis_reasons": reasons or ["Headline event rules" if positive + negative else "No reliable directional event"]}

"""Typed, abstaining event extraction from headline/snippet text.

Every extracted field carries the character span that supports it. A field
that the text does not state is null; nothing is inferred from outside the
text. Speculative language lowers certainty instead of being treated as fact.
"""
from __future__ import annotations

import re

from ..config import CATEGORY_PATTERNS

AMOUNT = re.compile(
    r"(?P<currency>₹|rs\.?|inr|\$|usd)\s?(?P<value>\d[\d,]*(?:\.\d+)?)\s?"
    r"(?P<unit>crore|cr|lakh|billion|bn|million|mn)?",
    re.I,
)
PERCENT = re.compile(r"(?P<value>\d+(?:\.\d+)?)\s?(?:%|per\s?cent|percent)", re.I)
PERIOD = re.compile(r"\b(?P<quarter>q[1-4])\s?(?:fy\s?'?(?P<fy>\d{2,4}))?|\bfy\s?'?(?P<fyonly>\d{2,4})\b", re.I)
DIRECTION = {
    "up": re.compile(r"\b(?:rises?|rose|jumps?|surges?|gains?|beats?|up|higher|grows?|increases?)\b", re.I),
    "down": re.compile(r"\b(?:falls?|fell|drops?|declines?|slumps?|misses?|down|lower|cuts?|decreases?)\b", re.I),
}
SPECULATIVE = re.compile(
    r"\b(?:reportedly|sources said|sources say|likely|may|might|could|considering|in talks|rumou?r|plans? to|expected to)\b",
    re.I,
)
COMPARISON = re.compile(r"\b(?:yoy|y-o-y|year[- ]on[- ]year|qoq|q-o-q|sequential(?:ly)?|from a year ago)\b", re.I)


def _span(match, offset=0):
    return [match.start() + offset, match.end() + offset]


def extract_event(article: dict, company) -> dict | None:
    """Return a typed event or None when the text supports no event type."""
    title = article.get("title", "")
    text = f"{title}\n{article.get('snippet', '')}"
    event_type, type_span = None, None
    for category, pattern in CATEGORY_PATTERNS.items():
        found = re.search(pattern, text, re.I)
        if found:
            event_type, type_span = category, _span(found)
            break
    if event_type is None:
        return None
    amounts = [{"currency": "INR" if m["currency"].lower() in ("₹", "rs", "rs.", "inr") else "USD",
                "value": float(m["value"].replace(",", "")),
                "unit": (m["unit"] or "").lower() or None, "span": _span(m)}
               for m in AMOUNT.finditer(text)]
    percents = [{"value": float(m["value"]), "span": _span(m)} for m in PERCENT.finditer(text)]
    period = PERIOD.search(text)
    directions = {name: pattern.search(title) for name, pattern in DIRECTION.items()}
    stated = [name for name, match in directions.items() if match]
    speculative = SPECULATIVE.search(text)
    comparison = COMPARISON.search(text)
    issuer_named = bool(re.search(re.escape(company.company), text, re.I)) or bool(
        re.search(r"(?<![A-Z0-9])" + re.escape(company.symbol) + r"(?![A-Z0-9])", text))
    return {
        "issuer": company.symbol if issuer_named else None,
        "issuer_basis": "named in text" if issuer_named else "not named; query context only",
        "type": event_type,
        "type_span": type_span,
        "period": (period.group(0).upper().replace(" ", "") if period else None),
        "period_span": _span(period) if period else None,
        "amounts": amounts,
        "percentages": percents,
        # Conflicting direction words abstain rather than pick one.
        "direction": stated[0] if len(stated) == 1 else None,
        "direction_span": _span(directions[stated[0]]) if len(stated) == 1 else None,
        "comparison_basis": comparison.group(0).lower() if comparison else None,
        "certainty": "speculative" if speculative else "reported",
        "certainty_span": _span(speculative) if speculative else None,
        "method": "rules-v1 (headline/snippet only; no document body)",
    }

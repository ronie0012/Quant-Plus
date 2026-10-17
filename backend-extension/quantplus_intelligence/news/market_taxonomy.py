"""Bounded market-news taxonomy shared by the existing RSS pipeline."""
from __future__ import annotations

import re


CATEGORIES = (
    "MACRO", "RBI", "INFLATION", "INTEREST_RATES", "FII_DII", "GLOBAL_MARKETS",
    "CRUDE_OIL", "RUPEE", "GEOPOLITICAL", "EARNINGS", "REGULATION", "BANKING",
    "IT", "AUTO", "PHARMA", "OTHER",
)

PATTERNS = (
    ("RBI", r"\brbi\b|reserve bank"),
    ("INFLATION", r"inflation|cpi|wpi"),
    ("INTEREST_RATES", r"interest rate|rate cut|rate hike|yield"),
    ("FII_DII", r"fii|dii|foreign investor|institutional flow"),
    ("CRUDE_OIL", r"crude|oil price|brent"),
    ("RUPEE", r"rupee|inr|currency"),
    ("GEOPOLITICAL", r"war|conflict|sanction|geopolit"),
    ("GLOBAL_MARKETS", r"wall street|nasdaq|dow jones|s\&p|global market|china|fed"),
    ("REGULATION", r"sebi|regulat|penalty|compliance|ban"),
    ("BANKING", r"bank|lending|credit|npa|deposit"),
    ("IT", r"information technology|software|it sector|infosys|tcs|wipro"),
    ("AUTO", r"auto|vehicle|car|two-wheeler|tata motors"),
    ("PHARMA", r"pharma|drug|healthcare|medicine"),
    ("EARNINGS", r"earnings|quarterly|profit|revenue|results|guidance"),
    ("MACRO", r"gdp|economy|fiscal|budget|manufacturing|growth"),
)

DURATION = {
    "RBI": "MULTIDAY", "INFLATION": "MULTIDAY", "INTEREST_RATES": "MULTIDAY",
    "GEOPOLITICAL": "MULTIDAY", "REGULATION": "MULTIDAY", "EARNINGS": "MULTIDAY",
    "CRUDE_OIL": "SHORT_TERM", "RUPEE": "SHORT_TERM", "FII_DII": "INTRADAY",
    "GLOBAL_MARKETS": "INTRADAY", "BANKING": "SHORT_TERM", "IT": "SHORT_TERM",
    "AUTO": "SHORT_TERM", "PHARMA": "SHORT_TERM", "MACRO": "MULTIDAY", "OTHER": "INTRADAY",
}


def classify(title: str) -> tuple[str, str, list[str]]:
    text = title.lower()
    category = next((name for name, pattern in PATTERNS if re.search(pattern, text, re.I)), "OTHER")
    sectors = []
    sector_patterns = {
        "BANK": r"bank|lending|credit|npa", "IT": r"information technology|software|it sector|infosys|tcs|wipro",
        "AUTO": r"auto|vehicle|car|two-wheeler|tata motors", "PHARMA": r"pharma|drug|healthcare|medicine",
        "FMCG": r"fmcg|consumer staples|consumer goods", "METAL": r"metal|steel|aluminium|copper",
        "ENERGY": r"energy|power|oil|gas|crude", "REALTY": r"realty|real estate|property",
    }
    for sector, pattern in sector_patterns.items():
        if re.search(pattern, text, re.I):
            sectors.append(sector)
    return category, DURATION[category], sectors

from __future__ import annotations

import re
from dataclasses import dataclass

EXPLICIT = {
    "RELIANCE": ("Reliance Industries", "Reliance Industries NSE", ("Jio", "Reliance Retail")),
    "TCS": ("Tata Consultancy Services", "Tata Consultancy Services TCS NSE", ()),
    "INFY": ("Infosys", "Infosys NSE", ()),
    "HDFCBANK": ("HDFC Bank", "HDFC Bank NSE", ()),
    "ICICIBANK": ("ICICI Bank", "ICICI Bank NSE", ()),
    # Tata Motors demerged: the passenger-vehicle company (incl. JLR) trades as TMPV.
    "TMPV": ("Tata Motors Passenger Vehicles", "Tata Motors Passenger Vehicles TMPV NSE",
             ("Jaguar Land Rover", "JLR")),
}
# Different listed entities whose names overlap a constituent. A headline naming one of
# these without the constituent's full name is not evidence about the constituent.
NAMESAKES = {
    "RELIANCE": ("Reliance Power", "Reliance Infra", "Reliance Infrastructure", "Reliance Capital",
                 "Reliance Home Finance", "Reliance Communications"),
    "HDFCBANK": ("HDFC Life", "HDFC AMC", "HDFC Asset Management", "HDFC Ergo"),
    "HDFCLIFE": ("HDFC Bank", "HDFC AMC"),
    "BAJFINANCE": ("Bajaj Finserv", "Bajaj Auto", "Bajaj Housing Finance", "Bajaj Electricals"),
    "BAJAJFINSV": ("Bajaj Finance", "Bajaj Auto", "Bajaj Housing Finance"),
    "BAJAJ-AUTO": ("Bajaj Finance", "Bajaj Finserv"),
    "TMPV": ("Tata Motors commercial", "TMCV", "Tata Motors CV"),
    "SBIN": ("SBI Life", "SBI Cards", "SBI Card", "SBI Mutual Fund"),
    "SBILIFE": ("State Bank of India", "SBI Card"),
    "ADANIENT": ("Adani Ports", "Adani Green", "Adani Power", "Adani Total Gas", "Adani Energy"),
    "ADANIPORTS": ("Adani Enterprises", "Adani Green", "Adani Power"),
    "TATASTEEL": ("Tata Motors", "Tata Power", "Tata Consumer"),
    "TATACONSUM": ("Tata Steel", "Tata Power", "Tata Motors"),
}
ROLES = {"ONGC": "oil_producer", "OIL": "oil_producer", "INDIGO": "oil_consumer",
         "SPICEJET": "oil_consumer", "ASIANPAINT": "oil_consumer", "BERGEPAINT": "oil_consumer"}


def normalize_symbol(value):
    value = value.strip().upper().removeprefix("NSE:").removesuffix(".NS").removesuffix("-EQ")
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9&-]{0,29}", value):
        raise ValueError("Expected an NSE equity symbol")
    return value


@dataclass(frozen=True)
class Company:
    symbol: str
    company: str
    query: str
    sector: str = "unknown"
    aliases: tuple[str, ...] = ()
    business_role: str = "unknown"
    namesakes: tuple[str, ...] = ()


def resolve(value, catalog=None):
    symbol = normalize_symbol(value)
    if catalog is None:
        from app.api.stocks import stock_catalog
        catalog = stock_catalog()
    metadata = next((r for r in catalog if r["symbol"] == symbol), {})
    sector = metadata.get("sector", "unknown")
    if symbol in EXPLICIT:
        company, query, aliases = EXPLICIT[symbol]
    else:
        company = metadata.get("company", symbol)
        company = re.sub(r"\s+(?:Limited|Ltd\.?)$", "", company, flags=re.I)
        query, aliases = f"{company} {symbol} NSE stock", ()
    return Company(symbol, company, query, sector, aliases, ROLES.get(symbol, "unknown"),
                   NAMESAKES.get(symbol, ()))

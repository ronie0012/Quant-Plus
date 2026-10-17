/**
 * Instrument resolution for the copilot. Only symbols typed in upper case that
 * exist in the instrument master, or recognised company names/aliases, resolve.
 * Ordinary words never become symbols; group names that match several issuers
 * are returned as ambiguous instead of guessed.
 */
import { nifty50, type InstrumentMeta } from "../../data/nifty50.ts";

export type Resolution = {
  resolved: {
    symbol: string;
    company: string;
    matched: string;
    via: "symbol" | "name" | "attached";
  }[];
  ambiguous: { term: string; candidates: string[] }[];
};

const SUFFIXES =
  /\s+(?:limited|ltd\.?|industries|company|corporation|corp\.?|enterprises?|institute)\b/gi;
// Short or popular names whose meaning is unambiguous for one constituent.
const ALIASES: Record<string, string> = {
  reliance: "RELIANCE",
  infosys: "INFY",
  tcs: "TCS",
  sbi: "SBIN",
  "state bank": "SBIN",
  airtel: "BHARTIARTL",
  "l&t": "LT",
  larsen: "LT",
  icici: "ICICIBANK",
  kotak: "KOTAKBANK",
  maruti: "MARUTI",
  zomato: "ETERNAL",
  eternal: "ETERNAL",
  indigo: "INDIGO",
  hul: "HINDUNILVR",
  "hindustan unilever": "HINDUNILVR",
  "sun pharma": "SUNPHARMA",
  "m&m": "M&M",
  mahindra: "M&M",
  "jio financial": "JIOFIN",
  "tata motors": "TMPV",
  jlr: "TMPV",
  "max healthcare": "MAXHEALTH",
  "apollo hospitals": "APOLLOHOSP",
  "bajaj auto": "BAJAJ-AUTO",
  "bajaj finance": "BAJFINANCE",
  "bajaj finserv": "BAJAJFINSV",
  "hdfc bank": "HDFCBANK",
  "hdfc life": "HDFCLIFE",
  "sbi life": "SBILIFE",
  "adani ports": "ADANIPORTS",
  "adani enterprises": "ADANIENT",
  "tata steel": "TATASTEEL",
  "tata consumer": "TATACONSUM",
  "coal india": "COALINDIA",
  "power grid": "POWERGRID",
  "asian paints": "ASIANPAINT",
  ultratech: "ULTRATECH",
};
// Group names shared by several constituents: never resolved without more detail.
const GROUPS: Record<string, string[]> = {
  tata: ["TCS", "TMPV", "TATASTEEL", "TATACONSUM", "TITAN"],
  bajaj: ["BAJFINANCE", "BAJAJFINSV", "BAJAJ-AUTO"],
  hdfc: ["HDFCBANK", "HDFCLIFE"],
  adani: ["ADANIENT", "ADANIPORTS"],
};

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(text: string, phrase: string) {
  return new RegExp(`(?<![a-z0-9&])${escape(phrase)}(?![a-z0-9&])`, "i").test(text);
}

export function resolveInstruments(
  text: string,
  attachedSymbol?: string | null,
  universe: InstrumentMeta[] = nifty50,
  limit = 5,
): Resolution {
  const bySymbol = new Map(universe.map((item) => [item.symbol, item]));
  const resolved: Resolution["resolved"] = [];
  const add = (symbol: string, matched: string, via: "symbol" | "name" | "attached") => {
    const item = bySymbol.get(symbol);
    if (item && !resolved.some((r) => r.symbol === symbol))
      resolved.push({ symbol, company: item.company, matched, via });
  };
  if (attachedSymbol && bySymbol.has(attachedSymbol))
    add(attachedSymbol, attachedSymbol, "attached");
  // Upper-case tokens as typed; lower-case words are never treated as tickers.
  for (const match of text.matchAll(/(?<![A-Za-z0-9&-])[A-Z][A-Z0-9&-]{1,14}(?![A-Za-z0-9&-])/g))
    if (bySymbol.has(match[0])) add(match[0], match[0], "symbol");
  const lower = text.toLowerCase();
  const claimed: string[] = [];
  for (const [alias, symbol] of Object.entries(ALIASES).sort((a, b) => b[0].length - a[0].length))
    if (mentions(lower, alias) && bySymbol.has(symbol)) {
      add(symbol, alias, "name");
      claimed.push(alias);
    }
  for (const item of universe) {
    const name = item.company.replace(SUFFIXES, "").trim();
    if (name.length >= 4 && mentions(lower, name.toLowerCase())) add(item.symbol, name, "name");
  }
  const ambiguous: Resolution["ambiguous"] = [];
  for (const [term, candidates] of Object.entries(GROUPS)) {
    if (!mentions(lower, term)) continue;
    // A more specific alias such as "tata steel" already settled this mention.
    if (claimed.some((alias) => alias.startsWith(`${term} `))) continue;
    const known = candidates.filter((symbol) => bySymbol.has(symbol));
    if (known.length && !resolved.some((r) => known.includes(r.symbol)))
      ambiguous.push({ term, candidates: known });
  }
  return { resolved: resolved.slice(0, limit), ambiguous };
}

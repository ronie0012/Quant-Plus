import { INSTRUMENT_MASTER_SOURCE, NIFTY50_MASTER } from "./instrument-master.ts";

/**
 * Instrument identity metadata for lookup and display only (NSE cash equities).
 * It carries no observations: no prices, weights or scores. Membership is the
 * official NSE list as of its retrieval date (see INSTRUMENT_MASTER_SOURCE);
 * it is not a point-in-time history of past constituents.
 */
export type InstrumentMeta = {
  symbol: string;
  company: string;
  sector: string;
};
export const INSTRUMENT_METADATA_NOTE = `NSE NIFTY 50 list as published ${INSTRUMENT_MASTER_SOURCE.retrieved}; weights require the provider.`;

/** An instrument with its latest provider observation; null when nothing was observed. */
export type Nifty50Stock = InstrumentMeta & { price: number | null; changePct: number | null };
// Identity metadata comes from the generated, hash-verified NSE instrument master.
export const nifty50: InstrumentMeta[] = NIFTY50_MASTER.map(({ symbol, company, industry }) => ({
  symbol,
  company,
  sector: industry,
}));
export const nifty50Sectors = ["All", ...Array.from(new Set(nifty50.map((s) => s.sector))).sort()];
export function stockBySymbol(symbol: string) {
  return nifty50.find((stock) => stock.symbol === decodeURIComponent(symbol).toUpperCase());
}

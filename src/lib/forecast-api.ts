import { authenticatedFetch } from "@/lib/workspace-session";

export type ForecastHorizon = 5 | 20;

export type ForecastContribution = {
  forecaster: string;
  p: number;
  weight: number;
  raw_p: number | null;
  note: string;
};

export type Forecast = {
  symbol: string;
  as_of: string;
  horizon: ForecastHorizon;
  benchmark: string;
  p_outperform: number | null;
  quantiles: Record<"0.1" | "0.5" | "0.9", number>;
  vol_forecast: number | null;
  p_event_shock: number | null;
  abstain: boolean;
  abstain_reason: string;
  contributions: ForecastContribution[];
  disagreement: number | null;
  robustness: number | null;
  blind: boolean;
  falsifiers: string[];
  model_version: string;
  authority: "RESEARCH_ONLY";
  matures_on: string | null;
  recorded_at: string;
  hash: string;
  settled_at: string | null;
  outcome: { excess_return: number; outperformed: 0 | 1 } | null;
  risk: { horizon_sigma: number; p_drawdown_5pct: number; p_drawdown_10pct: number };
  calibration: string;
  extras: {
    votes: { forecaster: string; p: number | null; abstain: boolean; reason: string }[];
    sources: Record<string, string>;
    events: { id: string; kind: string; days_ago: number }[];
    headline_count: number;
    crowding: { crowding: number | null; label?: string; note?: string };
  } | null;
  sector_rank: {
    day: string;
    sector: string;
    rank: number;
    of: number;
    p_outperform_sector: number;
  } | null;
};

export type TripwireStatus = {
  status: "HEALTHY" | "WEAKENED" | "BROKEN" | null;
  reason?: string;
  results?: { rule: string; severity: "hard" | "soft"; why: string; tripped: boolean | null }[];
  unobserved?: number;
  settled?: boolean;
  new_events?: string[];
};

export type InvestorProfile = "conservative" | "balanced" | "aggressive";

export type PersonalFit = {
  action: "consider" | "watch" | "do nothing" | "avoid" | "reduce";
  reasons: string[];
  profile: InvestorProfile;
  position_weight?: number;
  sector_weight?: number;
  marginal_daily_vol?: number;
  flags?: { flag: string; detail: string }[];
  note?: string;
};

export type PersonalBook = {
  equity: number;
  profile: InvestorProfile;
  positions: { symbol: string; value: number; sector: string | null }[];
  orders: { id: string; side: string; created_at: string }[];
};

export type ForecastResponse = { forecast: Forecast | null; reused?: boolean; authority: string };

export type Scoreboard = {
  log_loss: number | null;
  crps: number | null;
  reliability: { bin: number; n: number; mean_p: number; observed: number }[];
  coverage_curve: { coverage: number; n: number; brier: number | null }[];
  tournament_ic: { days: number; mean_ic: number | null; t_stat: number | null; gate: string };
  recorded: number;
  settled: number;
  scored: number;
  abstained: number;
  brier: number | null;
  brier_skill_vs_climatology: number | null;
  interval_80_coverage: number | null;
  forecasters: Record<string, { n: number; brier: number | null; skill: number | null }>;
  chain: { valid: boolean; checked: number; head?: string };
  claim: string;
};

async function forecastRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(`/api/${path}`, init, "Sign in to view AI forecasts");
  if (!response.ok) throw new Error(`Forecast unavailable (${response.status}). Please retry.`);
  return response.json() as Promise<T>;
}

export const fetchForecast = (symbol: string, horizon: ForecastHorizon, signal?: AbortSignal) =>
  forecastRequest<ForecastResponse>(
    `stocks/${encodeURIComponent(symbol)}/forecast?horizon=${horizon}`,
    signal ? { signal } : {},
  );

export const generateForecast = (symbol: string, horizon: ForecastHorizon) =>
  forecastRequest<ForecastResponse>(
    `stocks/${encodeURIComponent(symbol)}/forecast?horizon=${horizon}`,
    { method: "POST" },
  );

export const fetchTripwires = (symbol: string, horizon: ForecastHorizon, signal?: AbortSignal) =>
  forecastRequest<TripwireStatus>(
    `stocks/${encodeURIComponent(symbol)}/forecast/status?horizon=${horizon}`,
    signal ? { signal } : {},
  );

export const fetchPersonalFit = (symbol: string, horizon: ForecastHorizon, book: PersonalBook) =>
  forecastRequest<PersonalFit>(
    `stocks/${encodeURIComponent(symbol)}/forecast/personal?horizon=${horizon}`,
    { method: "POST", body: JSON.stringify(book), headers: { "Content-Type": "application/json" } },
  );

export const fetchScoreboard = (signal?: AbortSignal) =>
  forecastRequest<Scoreboard>("forecast/scoreboard", signal ? { signal } : {});

/** Price levels implied by the card's excess-return quantiles, relative to the last close. */
export function priceBand(forecast: Forecast, lastClose: number) {
  return {
    low: lastClose * (1 + forecast.quantiles["0.1"]),
    high: lastClose * (1 + forecast.quantiles["0.9"]),
  };
}

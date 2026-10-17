import { workspaceAuthorization } from "@/lib/workspace-session";

export type AgentReport = { agent: string; summary: string; confidence: number };
export type Prediction = {
  serving?: {
    freshness: "fresh" | "stale";
    age_seconds: number;
    refresh_status: string;
    data_cutoff: string;
    mode: "full_research";
  };
  previous_result?: Prediction | null;
  id: string;
  instrument: string;
  as_of: string;
  status: string;
  refresh_seconds: number;
  analysis_interval: string;
  decision: {
    action: "buy" | "sell" | "hold";
    rationale: string;
    authority: "RESEARCH_ONLY";
  } | null;
  thesis: {
    direction: string;
    conviction: number;
    key_evidence: string[];
    key_risks: string[];
  } | null;
  challenge: { status: string; reasons: string[] } | null;
  proposal: { direction: string; entry: number; stop: number; target: number } | null;
  reports: Record<string, AgentReport>;
  events: { stage: string; agent: string; status: string; ts: string }[];
};
export type MarketQuote = {
  symbol: string;
  price?: number;
  change?: number | null;
  change_pct?: number | null;
  source?: "fyers" | "yahoo";
  delayed?: boolean;
  stale: boolean;
  as_of?: string;
  received_at?: string;
  market_session?: "open" | "closed";
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  previous_close?: number | null;
  average_price?: number | null;
  bid?: number | null;
  ask?: number | null;
  bid_quantity?: number | null;
  ask_quantity?: number | null;
  last_quantity?: number | null;
  total_buy_quantity?: number | null;
  total_sell_quantity?: number | null;
  lower_circuit?: number | null;
  upper_circuit?: number | null;
  open_interest?: number | null;
  depth?: {
    bid: number | null;
    ask: number | null;
    bid_quantity: number | null;
    ask_quantity: number | null;
    bid_orders: number | null;
    ask_orders: number | null;
  }[];
  depth_source?: string | null;
  depth_status?: string;
  depth_as_of?: string;
  fallback_reason?: string;
  error?: string;
};
export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type MarketHistory = {
  symbol: string;
  source: string;
  as_of: string;
  interval: string;
  delayed?: boolean;
  candles: MarketCandle[];
};

export async function agentFetch(path: string, options: RequestInit = {}) {
  const authorization = await workspaceAuthorization("Sign in to access market intelligence");
  const headers = new Headers(options.headers);
  headers.set("Authorization", authorization);
  const response = await fetch(`/api/agent/${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const raw = await response.text();
    let detail = raw;
    try {
      detail = (JSON.parse(raw) as { detail?: string }).detail ?? raw;
    } catch {
      /* plain error */
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response;
}

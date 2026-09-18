import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Account = {
  currency: string;
  total_funds: number;
  funds_used: number;
  profit: number;
  profit_pct: number;
  wallet_balance: number;
  onboarded: boolean;
  updated_at: string;
};

export type Holding = {
  id: string;
  symbol: string;
  company: string;
  sector: string | null;
  quantity: number;
  avg_price: number;
  last_price: number;
};

export type WatchItem = {
  id: string;
  symbol: string;
  company: string;
  price: number;
  change_pct: number;
};

export type Analysis = {
  id: string;
  symbol: string;
  verdict: string;
  conviction: number;
  risk: string;
  summary: string | null;
  created_at: string;
};

export type Instrument = {
  symbol: string;
  name: string;
  kind: string;
  currency: string;
  value: number;
  change_abs: number;
  change_pct: number;
  sort_order: number;
  updated_at: string;
};

export type NewsItem = {
  id: string;
  headline: string;
  source: string;
  category: string;
  sentiment: string;
  impact: string;
  published_at: string;
};

export type MarketEvent = {
  id: string;
  event: string;
  region: string;
  importance: string;
  event_time: string;
};

export type Sentiment = {
  id: string;
  score: number;
  label: string;
  breakdown: { label: string; value: string }[];
  updated_at: string;
};

const STALE = 60_000;

export function useAccount() {
  return useQuery({
    queryKey: ["account"],
    staleTime: STALE,
    queryFn: async (): Promise<Account | null> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("currency,total_funds,funds_used,profit,profit_pct,wallet_balance,onboarded,updated_at")
        .maybeSingle();
      if (error) throw error;
      return (data as Account | null) ?? null;
    },
  });
}

export function useHoldings() {
  return useQuery({
    queryKey: ["holdings"],
    staleTime: STALE,
    queryFn: async (): Promise<Holding[]> => {
      const { data, error } = await supabase
        .from("holdings")
        .select("id,symbol,company,sector,quantity,avg_price,last_price")
        .order("symbol");
      if (error) throw error;
      return (data ?? []) as Holding[];
    },
  });
}

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    staleTime: STALE,
    queryFn: async (): Promise<WatchItem[]> => {
      const { data, error } = await supabase
        .from("watchlist_items")
        .select("id,symbol,company,price,change_pct")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as WatchItem[];
    },
  });
}

export function useAnalyses() {
  return useQuery({
    queryKey: ["analyses"],
    staleTime: STALE,
    queryFn: async (): Promise<Analysis[]> => {
      const { data, error } = await supabase
        .from("analyses")
        .select("id,symbol,verdict,conviction,risk,summary,created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as Analysis[];
    },
  });
}

export function useInstruments() {
  return useQuery({
    queryKey: ["instruments"],
    staleTime: STALE,
    queryFn: async (): Promise<Instrument[]> => {
      const { data, error } = await supabase
        .from("market_instruments")
        .select("symbol,name,kind,currency,value,change_abs,change_pct,sort_order,updated_at")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Instrument[];
    },
  });
}

export function useNews() {
  return useQuery({
    queryKey: ["news"],
    staleTime: STALE,
    queryFn: async (): Promise<NewsItem[]> => {
      const { data, error } = await supabase
        .from("market_news")
        .select("id,headline,source,category,sentiment,impact,published_at")
        .order("published_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as NewsItem[];
    },
  });
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    staleTime: STALE,
    queryFn: async (): Promise<MarketEvent[]> => {
      const { data, error } = await supabase
        .from("market_events")
        .select("id,event,region,importance,event_time")
        .order("event_time")
        .limit(6);
      if (error) throw error;
      return (data ?? []) as MarketEvent[];
    },
  });
}

export function useSentiment() {
  return useQuery({
    queryKey: ["sentiment"],
    staleTime: STALE,
    queryFn: async (): Promise<Sentiment | null> => {
      const { data, error } = await supabase
        .from("market_sentiment")
        .select("id,score,label,breakdown,updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Sentiment | null) ?? null;
    },
  });
}

export function formatINR(value: number, opts: { compact?: boolean } = {}) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(value);
}

export function formatNum(value: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(Math.abs(diff) / 60000);
  const future = diff < 0;
  const text =
    mins < 1
      ? "just now"
      : mins < 60
        ? `${mins} min`
        : mins < 1440
          ? `${Math.round(mins / 60)} hr`
          : `${Math.round(mins / 1440)} d`;
  if (mins < 1) return text;
  return future ? `in ${text}` : `${text} ago`;
}

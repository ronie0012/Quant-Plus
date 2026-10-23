import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pill } from "@/components/app/cards";
import { useAccount, useHoldings } from "@/hooks/use-dashboard-data";
import { useOrders } from "@/hooks/use-orders";
import {
  fetchPersonalFit,
  fetchTripwires,
  type Forecast,
  type InvestorProfile,
} from "@/lib/forecast-api";

const PROFILE_KEY = "quantplus.forecast.profile";
const PROFILES: InvestorProfile[] = ["conservative", "balanced", "aggressive"];

function storedProfile(): InvestorProfile {
  try {
    const value = localStorage.getItem(PROFILE_KEY);
    return PROFILES.includes(value as InvestorProfile) ? (value as InvestorProfile) : "balanced";
  } catch {
    return "balanced";
  }
}

const statusTone = { HEALTHY: "positive", WEAKENED: "warning", BROKEN: "negative" } as const;
const actionTone = {
  consider: "positive",
  watch: "neutral",
  "do nothing": "neutral",
  avoid: "negative",
  reduce: "warning",
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 px-5 py-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

/** Sector rank, evidence coverage, live tripwires and personal fit for one locked card. */
export function ForecastPanels({ card }: { card: Forecast }) {
  return (
    <>
      <EvidencePanel card={card} />
      {!card.abstain && <TripwirePanel card={card} />}
      {!card.abstain && <PersonalPanel card={card} />}
    </>
  );
}

function EvidencePanel({ card }: { card: Forecast }) {
  const rank = card.sector_rank;
  const sources = card.extras?.sources ?? {};
  const crowding = card.extras?.crowding;
  return (
    <Section title="Evidence & sector">
      <div className="space-y-1.5 text-xs">
        <p>
          {rank
            ? `Sector tournament (${rank.day}): rank ${rank.rank} of ${rank.of} in ${rank.sector} · ${Math.round(
                rank.p_outperform_sector * 100,
              )}% chance of beating sector peers`
            : "Not yet ranked in a sector tournament."}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(sources).map(([name, state]) => (
            <Pill key={name} tone={state.startsWith("available") ? "positive" : "neutral"}>
              {name}: {state.startsWith("available") ? "used" : state}
            </Pill>
          ))}
          {card.extras && <Pill tone="neutral">{card.extras.headline_count} headlines</Pill>}
          {card.extras?.events.map((event) => (
            <Pill key={event.id} tone="primary">
              {event.kind.replaceAll("_", " ")} · {event.days_ago}d ago
            </Pill>
          ))}
        </div>
        {crowding?.crowding != null && (
          <p className="text-muted-foreground">
            Narrative crowding {crowding.crowding.toFixed(2)} ({crowding.label}) — a pre-registered
            hypothesis, not a signal.
          </p>
        )}
      </div>
    </Section>
  );
}

function TripwirePanel({ card }: { card: Forecast }) {
  const status = useQuery({
    queryKey: ["forecast-status", card.symbol, card.horizon, card.hash],
    queryFn: ({ signal }) => fetchTripwires(card.symbol, card.horizon, signal),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: false,
  });
  const data = status.data;
  return (
    <Section title="Live tripwires">
      {status.isLoading ? (
        <p className="text-xs text-muted-foreground">Checking against the latest prices…</p>
      ) : status.isError || !data?.status ? (
        <p className="text-xs text-muted-foreground">
          {status.error?.message ?? data?.reason ?? "Tripwire check unavailable."}
        </p>
      ) : (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Pill tone={statusTone[data.status]}>{data.status}</Pill>
            {data.unobserved ? (
              <span className="text-muted-foreground">{data.unobserved} not observable yet</span>
            ) : null}
          </div>
          <ul className="space-y-0.5 font-mono">
            {data.results?.map((r) => (
              <li key={r.rule} className={r.tripped ? "text-foreground" : "text-muted-foreground"}>
                {r.tripped ? "●" : r.tripped === null ? "?" : "○"} {r.rule}{" "}
                <span className="font-sans">({r.severity})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function PersonalPanel({ card }: { card: Forecast }) {
  const [profile, setProfile] = useState<InvestorProfile>(storedProfile);
  const account = useAccount();
  const holdings = useHoldings();
  const orders = useOrders();
  const ready = account.isSuccess && holdings.isSuccess && orders.isSuccess;
  const positions = (holdings.data ?? []).map((h) => ({
    symbol: h.symbol,
    value: h.quantity * (h.last_price || h.avg_price),
    sector: h.sector,
  }));
  const equity =
    (account.data?.wallet_balance ?? 0) + positions.reduce((sum, p) => sum + p.value, 0);
  const fit = useQuery({
    queryKey: ["forecast-personal", card.symbol, card.horizon, card.hash, profile, equity],
    enabled: ready,
    queryFn: () =>
      fetchPersonalFit(card.symbol, card.horizon, {
        equity,
        profile,
        positions,
        orders: (orders.data ?? []).map((o) => ({
          id: o.id,
          side: o.side,
          created_at: o.created_at,
        })),
      }),
    staleTime: 60_000,
    retry: false,
  });
  const choose = (value: InvestorProfile) => {
    setProfile(value);
    try {
      localStorage.setItem(PROFILE_KEY, value);
    } catch {
      // Profile choice is a per-browser convenience only.
    }
  };
  return (
    <Section title="What this means for you">
      <div className="mb-2 flex flex-wrap gap-1">
        {PROFILES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            aria-pressed={profile === value}
            className={`rounded-md border px-2 py-0.5 text-xs capitalize ${
              profile === value ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      {!ready || fit.isLoading ? (
        <p className="text-xs text-muted-foreground">Reading your paper book…</p>
      ) : fit.isError || !fit.data ? (
        <p className="text-xs text-muted-foreground">
          {fit.error?.message ?? "Personal fit unavailable."}
        </p>
      ) : (
        <div className="space-y-1.5 text-xs">
          <Pill tone={actionTone[fit.data.action]}>{fit.data.action}</Pill>
          <ul className="list-disc space-y-0.5 pl-4">
            {fit.data.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {fit.data.flags?.map((flag) => (
              <li key={flag.flag}>Habit check: {flag.detail}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Research guidance for your paper book only — never an order. {fit.data.note}
          </p>
        </div>
      )}
    </Section>
  );
}

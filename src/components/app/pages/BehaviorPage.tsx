import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHead, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useBehaviorPolicy } from "@/hooks/use-workspace-prefs";
import { useBehaviorState } from "@/hooks/use-trade-guard";
import { evaluateProtections, roundTrips, type BehaviorPolicy } from "@/lib/quant/behavior";
import { median } from "@/lib/quant/stats";
import { formatINR } from "@/hooks/use-dashboard-data";

/**
 * Personal behavioural risk. Nothing is analysed until the user consents; the
 * findings describe patterns in their own paper history with sample sizes and
 * never score, rank or shame.
 */
export function BehaviorPage() {
  const { policy, save, loading } = useBehaviorPolicy();
  const state = useBehaviorState();
  const [draft, setDraft] = useState<BehaviorPolicy | null>(null);
  const current = draft ?? policy;
  const set = (patch: Partial<BehaviorPolicy>) => setDraft({ ...current, ...patch });
  const trips = roundTrips(state.orders);
  const typical = median(
    state.orders
      .filter((o) => o.side === "BUY" && o.filled_quantity > 0)
      .map((o) => o.filled_quantity * (o.avg_fill_price ?? o.price)),
  );
  const now = evaluateProtections(policy, {
    now: Date.now(),
    orders: state.orders,
    plan_ready: false,
    proposed_value: typical ?? 0,
    drawdown_pct: state.drawdown_pct,
    side: "BUY",
    patterns: state.patterns,
  });
  const detected = state.patterns.filter((p) => p.detected);

  async function persist(next: BehaviorPolicy) {
    try {
      await save.mutateAsync(next);
      setDraft(null);
      toast.success(next.consent ? "Behavioural protections saved" : "Behavioural analysis is off");
    } catch {
      toast.error("Settings could not be saved");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Behavioural risk"
        title="Behaviour"
        body="With your consent, Quant Plus looks for patterns in your own paper history that tend to hurt results: sizing up after losses, quick re-entries, moved stops, ignored invalidation. Findings are descriptive, use your data only, and come with their sample sizes. Protections are yours to configure and never block an exit."
        status={policy.consent ? "Analysis on · your data only" : "Analysis off"}
      >
        <MetricStrip
          items={[
            { label: "Closed round trips", value: trips.length },
            {
              label: "Patterns observed",
              value: policy.consent ? detected.length : "—",
              tone: detected.length ? "warning" : "positive",
            },
            {
              label: "Realised drawdown",
              value: policy.consent ? `${state.drawdown_pct.toFixed(1)}%` : "—",
              note: "From peak cumulative P&L, % of deposits",
            },
            {
              label: "Protections active now",
              value: policy.consent ? now.blocks.length : "—",
              tone: now.blocks.length ? "negative" : "primary",
            },
          ]}
        />
      </PageIntro>

      <Card glow>
        <CardHead
          title="Consent"
          meta="Required before any analysis"
          action={
            policy.consent ? (
              <ShieldCheck className="h-4 w-4 text-positive" />
            ) : (
              <ShieldOff className="h-4 w-4 text-subtle" />
            )
          }
        />
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-[13px] text-muted-foreground">
            The analysis reads your paper orders, fills and decision plans inside this workspace.
            Nothing is sent elsewhere or shared. You can turn it off at any time; protections stop
            with it.
          </p>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={current.consent}
              disabled={loading || save.isPending}
              onCheckedChange={(checked) => void persist({ ...current, consent: checked })}
              aria-label="Consent to behavioural analysis"
            />
            {current.consent ? "I consent" : "Off"}
          </label>
        </div>
      </Card>

      {policy.consent && (
        <>
          <Card>
            <CardHead
              title="Patterns in your history"
              meta="Descriptive statistics over closed paper trades"
            />
            {state.loading ? (
              <Skeleton className="m-5 h-40" />
            ) : (
              <ul className="divide-y divide-border">
                {state.patterns.map((pattern) => (
                  <li
                    key={pattern.key}
                    className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="max-w-3xl">
                      <p className="flex items-center gap-2 text-[13.5px]">
                        {pattern.title}
                        <WhyButton
                          claim={{
                            id: `behavior:${pattern.key}`,
                            label: pattern.title,
                            value: pattern.detected
                              ? "Observed"
                              : pattern.statement
                                ? "Not observed"
                                : "Too little data",
                            statement:
                              pattern.statement ??
                              `Needs at least ${pattern.min_sample} qualifying trades; ${pattern.sample} so far.`,
                            source: { name: "Your paper book (orders, fills, decision plans)" },
                            calculation: {
                              formula:
                                "First-in-first-out round trips; medians of entry notional; mean return per trade",
                              inputs: [{ name: "sample", value: String(pattern.sample) }],
                            },
                            page: "behavior",
                          }}
                        />
                      </p>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">
                        {pattern.statement ??
                          `Not enough history yet: ${pattern.sample} of ${pattern.min_sample} qualifying trades.`}
                      </p>
                    </div>
                    <Pill
                      tone={
                        pattern.detected ? "warning" : pattern.statement ? "positive" : "neutral"
                      }
                    >
                      {pattern.detected
                        ? "Pattern present"
                        : pattern.statement
                          ? "Not present"
                          : "Insufficient data"}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead
              title="Protections"
              meta="Apply to new entries only; exits are never blocked"
            />
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <NumberSetting
                label="Cooling-off minutes after consecutive losses"
                value={current.cooling_off_minutes}
                min={0}
                max={1440}
                onChange={(v) => set({ cooling_off_minutes: v })}
                hint="0 turns the cooling-off period off."
              />
              <NumberSetting
                label="Consecutive losses that start a cooling-off"
                value={current.cooling_off_after_losses}
                min={1}
                max={20}
                onChange={(v) => set({ cooling_off_after_losses: v })}
              />
              <NumberSetting
                label="Maximum decisions per day"
                value={current.max_daily_decisions}
                min={0}
                max={500}
                onChange={(v) => set({ max_daily_decisions: v })}
                hint="Counts orders placed today (IST). 0 means no limit."
              />
              <NumberSetting
                label="Drawdown that reduces risk (%)"
                value={current.drawdown_trigger_pct}
                min={0}
                max={100}
                onChange={(v) => set({ drawdown_trigger_pct: v })}
                hint="Realised drawdown from peak, % of deposits. 0 turns it off."
              />
              <NumberSetting
                label="Entry size during drawdown (% of typical)"
                value={current.drawdown_size_pct}
                min={1}
                max={100}
                onChange={(v) => set({ drawdown_size_pct: v })}
                hint={typical ? `Typical entry: ${formatINR(typical)}` : "No entries yet"}
              />
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-3 text-[13px]">
                  Mandatory thesis review before entries
                  <Switch
                    checked={current.mandatory_thesis}
                    onCheckedChange={(v) => set({ mandatory_thesis: v })}
                    aria-label="Mandatory thesis review"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-[13px]">
                  Ask me to explain why a trade is different
                  <Switch
                    checked={current.explain_prompt}
                    onCheckedChange={(v) => set({ explain_prompt: v })}
                    aria-label="Explain prompt"
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
              <Button
                disabled={!draft || save.isPending}
                onClick={() => draft && void persist(draft)}
              >
                Save protections
              </Button>
              {now.blocks.length > 0 && (
                <ul className="text-[12px] text-negative">
                  {now.blocks.map((b) => (
                    <li key={b}>Active now: {b}</li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <label className="block text-[13px]">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="mt-2 w-full border border-border bg-background p-2.5 font-mono outline-none"
      />
      {hint && <span className="mt-1 block text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

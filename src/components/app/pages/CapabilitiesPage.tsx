import { CheckCircle2, CircleDashed, Lock, TriangleAlert } from "lucide-react";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { PageIntro } from "@/components/app/pages/workspace";
import { useSymbolHistory, useCalendar } from "@/hooks/use-quant-data";
import { useAccount } from "@/hooks/use-dashboard-data";
import { validateCandles } from "@/lib/market-history";
import { CHARGE_SCHEDULES } from "@/lib/paper-fees";
import { cn } from "@/lib/utils";

type Status = "AVAILABLE" | "PARTIAL" | "NOT_STARTED" | "BLOCKED";

type Stage = {
  title: string;
  status: Status;
  evidence: string[];
  gate: string;
};

const ICON = {
  AVAILABLE: CheckCircle2,
  PARTIAL: TriangleAlert,
  NOT_STARTED: CircleDashed,
  BLOCKED: Lock,
} as const;
const TONE = {
  AVAILABLE: "positive",
  PARTIAL: "warning",
  NOT_STARTED: "neutral",
  BLOCKED: "negative",
} as const;

/**
 * Broader market capability, in order. A stage is only worked on after the
 * one before it passes its integrity and evidence gate; statuses below are
 * derived from what is actually connected in this workspace.
 */
export function CapabilitiesPage() {
  const { data: account } = useAccount();
  const intraday = useSymbolHistory("RELIANCE", "1D");
  const calendar = useCalendar();
  const minuteBars = validateCandles(intraday.data?.candles).candles.length;
  const corporate = calendar.data?.providers.find((p) => p.source === "Corporate action");
  const stages: Stage[] = [
    {
      title: "NSE cash-equity delivery",
      status: account ? "AVAILABLE" : "PARTIAL",
      evidence: [
        "Paper book with atomic settlement, reservations, T+1 settlement and reconciliation",
        `Versioned charge schedule ${CHARGE_SCHEDULES[0]?.id ?? "—"} (STT, exchange, SEBI, stamp, GST)`,
        "Pre-trade risk compiler and decision-plan lifecycle on every ticket",
      ],
      gate: "Book reconciles, charges itemised and sourced, decision lifecycle in place.",
    },
    {
      title: "Validated intraday history",
      status: minuteBars > 0 ? "PARTIAL" : "NOT_STARTED",
      evidence: [
        minuteBars
          ? `Provider returns ${minuteBars} validated 1-minute bars for the last session`
          : "No intraday bars returned right now",
        "15-minute bars for one week; no stored multi-month intraday archive",
      ],
      gate: "Persisted, gap-checked intraday archive with licensing confirmed for replay.",
    },
    {
      title: "Corporate actions",
      status: corporate?.status === "available" ? "PARTIAL" : "NOT_STARTED",
      evidence: [
        `NSE corporate-action calendar: ${corporate?.status ?? "status unknown"}`,
        "No split/bonus/dividend adjustment factors are applied to history",
      ],
      gate: "Adjustment factors applied to history and positions, verified against exchange records.",
    },
    {
      title: "Futures",
      status: "NOT_STARTED",
      evidence: ["No futures instruments, margins or mark-to-market"],
      gate: "Contract master, margin model and daily settlement in the paper book.",
    },
    {
      title: "Options chains and strategy analysis",
      status: "NOT_STARTED",
      evidence: ["Options lab is shown as unavailable; no observed option chain"],
      gate: "Observed chains with verified lot sizes, expiries and contract rules.",
    },
    {
      title: "Options replay and risk",
      status: "BLOCKED",
      evidence: ["Depends on stored option-chain history"],
      gate: "Historical chains with point-in-time Greeks and fills.",
    },
    {
      title: "BSE and global instruments",
      status: "NOT_STARTED",
      evidence: ["SENSEX index quote only; no BSE or global tradeable instruments"],
      gate: "Separate calendars, currencies, charges and instrument masters.",
    },
    {
      title: "Broker integrations",
      status: "NOT_STARTED",
      evidence: ["Fyers is used for market data only; no order routing"],
      gate: "Read-only account sync first, with reconciliation against the broker.",
    },
    {
      title: "Live trading",
      status: "BLOCKED",
      evidence: ["Paper trading only, by design"],
      gate: "Separate production, regulatory and operational readiness: compliance review, audit trail, kill switch, incident runbooks.",
    },
  ];
  const firstOpen = stages.findIndex((s) => s.status !== "AVAILABLE");
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Market roadmap"
        title="Broader markets, in the correct order."
        body="Each capability is added only after the previous one passes its integrity and evidence gate. Statuses are read from what this workspace can actually do today."
        status="Paper trading only"
      />
      <Card>
        <CardHead title="Capability gates" meta="Top to bottom" />
        <ol className="divide-y divide-border">
          {stages.map((stage, i) => {
            const Icon = ICON[stage.status];
            const locked = i > firstOpen && firstOpen >= 0 && stage.status !== "AVAILABLE";
            return (
              <li
                key={stage.title}
                className={cn(
                  "grid gap-3 px-5 py-4 md:grid-cols-[40px_1fr_280px]",
                  locked && "opacity-70",
                )}
              >
                <span className="font-mono text-[11px] text-subtle">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="flex items-center gap-2 text-[14px]">
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        stage.status === "AVAILABLE"
                          ? "text-positive"
                          : stage.status === "PARTIAL"
                            ? "text-warning"
                            : stage.status === "BLOCKED"
                              ? "text-negative"
                              : "text-subtle",
                      )}
                    />
                    {stage.title}
                    <Pill tone={TONE[stage.status]}>{stage.status.replace("_", " ")}</Pill>
                    {i === firstOpen && <Pill tone="primary">Current gate</Pill>}
                  </p>
                  <ul className="mt-1.5 list-disc pl-5 text-[12px] text-muted-foreground">
                    {stage.evidence.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-[12px] text-subtle">
                  <span className="font-medium text-[11px] uppercase tracking-[0.06em]">
                    Gate to pass
                  </span>
                  <span className="mt-1 block">{stage.gate}</span>
                </p>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

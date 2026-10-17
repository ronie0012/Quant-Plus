import { useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wallet,
} from "lucide-react";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import { MetricStrip, PageIntro, ProgressBar, Segmented } from "@/components/app/pages/workspace";
import { Button } from "@/components/ui/button";
import { formatINR, relativeTime, useAccount, useMarkedHoldings } from "@/hooks/use-dashboard-data";
import {
  tradingErrorMessage,
  useFundPractice,
  useFundWallet,
  usePracticeBook,
  useWalletLedgerPage,
} from "@/hooks/use-wallet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSession } from "@/hooks/use-session";

const presets = [100_000, 1_000_000, 5_000_000, 10_000_000];

const kindLabel: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAW: "Withdrawal",
  BUY: "Buy settlement",
  SELL: "Sell settlement",
  CHARGES: "Charges",
  MIGRATION_ADJUSTMENT: "Migration adjustment",
};
const ledgerKinds = ["ALL", "DEPOSIT", "WITHDRAW", "BUY", "SELL", "CHARGES"] as const;
const PAGE_SIZE = 20;

/** Wallet: simulated cash balance, funding controls and the full cash ledger. */
export function WalletPage() {
  const { session } = useSession();
  const { data: account, isLoading, isError, refetch } = useAccount();
  const { data: holdings } = useMarkedHoldings();
  const [kind, setKind] = useState<(typeof ledgerKinds)[number]>("ALL");
  const [page, setPage] = useState(0);
  const ledger = useWalletLedgerPage(page, PAGE_SIZE, kind);
  const txns = ledger.data?.rows;
  const txnLoading = ledger.isLoading;
  const totalRows = ledger.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const fund = useFundWallet();
  // An identical retry reuses its intent so a lost response cannot double-fund.
  const fundingIntent = useRef<{ key: string; id: string } | null>(null);

  const [mode, setMode] = useState<"Add funds" | "Withdraw">("Add funds");
  const [amount, setAmount] = useState("100000");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const invested = useMemo(
    () => (holdings ?? []).reduce((acc, h) => acc + Number(h.quantity) * Number(h.avg_price), 0),
    [holdings],
  );
  const marketValue = useMemo(
    () => (holdings ?? []).reduce((acc, h) => acc + Number(h.quantity) * Number(h.last_price), 0),
    [holdings],
  );

  const value = Number(amount.replace(/[^0-9.]/g, "")) || 0;
  const balance = Number(account?.wallet_balance ?? 0);
  const withdrawable = Number(account?.withdrawable_cash ?? 0);
  const equity = balance + marketValue;
  const deployedPct = equity > 0 ? (marketValue / equity) * 100 : 0;

  async function submit() {
    setError(null);
    setDone(null);
    const kind = mode === "Withdraw" ? "WITHDRAW" : "DEPOSIT";
    const key = `${kind}:${value}`;
    if (fundingIntent.current?.key !== key)
      fundingIntent.current = { key, id: crypto.randomUUID() };
    try {
      await fund.mutateAsync({ amount: value, kind, intent_id: fundingIntent.current.id });
      fundingIntent.current = null;
      setDone(
        mode === "Withdraw"
          ? `${formatINR(value)} withdrawn from your wallet.`
          : `${formatINR(value)} added to your wallet.`,
      );
    } catch (err) {
      setError(tradingErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Wallet"
        title="Simulated capital"
        body="Cash available for trading, capital currently deployed in holdings and a full record of every movement. Buys deduct from this wallet; sells return the proceeds."
        status="Simulated cash"
      />

      {isError ? (
        <Card>
          <EmptyState
            title="Wallet unavailable"
            hint="Your balance could not be loaded right now."
            onRetry={() => void refetch()}
          />
        </Card>
      ) : isLoading ? (
        <Card className="p-5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-9 w-52" />
        </Card>
      ) : (
        <MetricStrip
          items={[
            {
              label: "Wallet balance",
              value: formatINR(balance, { exact: true }),
              note: account?.reserved_cash
                ? `${formatINR(Number(account.available_cash ?? 0), { exact: true })} available · ${formatINR(account.reserved_cash, { exact: true })} reserved for resting orders`
                : "Available to trade",
              tone: "primary",
            },
            { label: "Deployed", value: formatINR(invested), note: "Cost of open holdings" },
            {
              label: "Settled cash",
              value:
                account?.settled_cash == null ? "Unavailable" : formatINR(account.settled_cash),
              note: "Paper T+1 clearing calendar",
            },
            {
              label: "Unsettled cash",
              value:
                account?.unsettled_cash == null ? "Unavailable" : formatINR(account.unsettled_cash),
              note: "Sale proceeds awaiting settlement",
            },
            {
              label: "Withdrawable",
              value: formatINR(withdrawable),
              note: "Settled cash after order reservations",
            },
            {
              label: "Holdings value",
              value: formatINR(marketValue),
              note: "Provider marks; inspect quote freshness",
            },
            {
              label: "Realised P&L",
              value: formatINR(Number(account?.profit ?? 0), { exact: true }),
              note: `Net of ${formatINR(Number(account?.charges_paid ?? 0), { exact: true })} charges · ${Number(account?.profit_pct ?? 0).toFixed(2)}% of funds added`,
              tone: Number(account?.profit ?? 0) >= 0 ? "positive" : "negative",
            },
          ]}
        />
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card delay={140}>
          <CardHead
            title="Cash ledger"
            meta={`${totalRows} entries · every deposit, withdrawal, settlement and charge`}
            action={
              <Segmented
                label="Ledger entry type"
                items={ledgerKinds}
                value={kind}
                onChange={(next) => {
                  setKind(next);
                  setPage(0);
                }}
              />
            }
          />
          {txnLoading ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !txns || txns.length === 0 ? (
            <EmptyState
              title="No movements yet"
              hint="Add funds or place an order and it will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="border-b border-border font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Detail</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3 text-right">Balance</th>
                    <th className="px-5 py-3 text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((txn, index) => {
                    const credit = Number(txn.amount) >= 0;
                    return (
                      <tr
                        key={txn.id}
                        className="dash-rise border-b border-border/60 last:border-0 transition-colors hover:bg-panel-elevated"
                        style={{ ["--d" as string]: `${120 + index * 40}ms` }}
                      >
                        <td className="px-5 py-3">
                          <Pill tone={credit ? "positive" : "neutral"}>
                            {kindLabel[txn.kind] ?? txn.kind}
                          </Pill>
                        </td>
                        <td className="px-5 py-3 text-[12.5px] text-muted-foreground">
                          {txn.note ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "px-5 py-3 text-right font-mono text-[12.5px] num-tabular",
                            credit ? "text-positive" : "text-negative",
                          )}
                        >
                          {credit ? "+" : "−"}
                          {formatINR(Math.abs(Number(txn.amount)), { exact: true })}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] num-tabular">
                          {formatINR(Number(txn.balance_after), { exact: true })}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-[11px] uppercase text-subtle">
                          {relativeTime(txn.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Newer
            </Button>
            <span className="font-mono text-[10px] text-subtle">
              Page {page + 1} of {pages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Older <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card glow delay={200}>
            <CardHead
              title="Manage funds"
              meta="Simulated transfers settle instantly"
              action={<Wallet className="h-3.5 w-3.5 text-primary-soft" />}
            />
            <div className="p-5">
              <Segmented
                label="Transfer type"
                items={["Add funds", "Withdraw"]}
                value={mode}
                onChange={(next) => {
                  setMode(next as "Add funds" | "Withdraw");
                  setError(null);
                  setDone(null);
                }}
              />

              <div className="mt-5 flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant="outline"
                    onClick={() => setAmount(String(preset))}
                    aria-pressed={value === preset}
                    className={cn(
                      "font-mono text-[10px] tracking-[0.04em]",
                      value === preset && "border-primary/50 bg-primary/10 text-primary-soft",
                    )}
                  >
                    {formatINR(preset)}
                  </Button>
                ))}
              </div>

              <label className="mt-5 block">
                <span className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                  Amount
                </span>
                <span className="mt-2 flex items-center border border-border bg-background/40 px-3">
                  <span className="font-mono text-sm text-subtle">₹</span>
                  <input
                    inputMode="numeric"
                    value={amount}
                    aria-label="Amount"
                    onChange={(event) => setAmount(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent py-3 text-right font-mono text-base outline-none"
                  />
                </span>
              </label>

              {error && <p className="mt-4 text-[12.5px] text-negative">{error}</p>}
              {done && <p className="mt-4 text-[12.5px] text-positive">{done}</p>}
              {mode === "Withdraw" && (
                <p className="mt-4 text-[12px] text-subtle">
                  {formatINR(withdrawable)} is available to withdraw. Sale proceeds release after
                  the next clearing day finishes, excluding weekends and verified settlement
                  holidays.
                  {account?.settlement_status === "UNVERIFIED" &&
                    " Some historical fills have unverified settlement dates and need reconciliation."}
                </p>
              )}

              <Button
                onClick={() => void submit()}
                disabled={
                  fund.isPending || value <= 0 || (mode === "Withdraw" && value > withdrawable)
                }
                className="mt-5 h-12 w-full font-mono text-[11px] tracking-[0.04em]"
              >
                {fund.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : mode === "Withdraw" ? (
                  <ArrowUpFromLine />
                ) : (
                  <ArrowDownToLine />
                )}
                {mode === "Withdraw" ? "Withdraw" : "Add"} {formatINR(value)}
              </Button>
              <p className="mt-3 text-[11px] leading-relaxed text-subtle">
                Simulation only. No real funds move and no broker is connected.
              </p>
            </div>
          </Card>

          {session?.mode === "local" && <PracticeAccountCard />}

          <Card delay={260}>
            <CardHead title="Capital usage" meta="Cash versus deployed capital" />
            <div className="p-5">
              <ProgressBar value={deployedPct} tone="primary" delay={320} />
              <dl className="mt-4 space-y-2.5 font-mono text-[11px] num-tabular">
                <div className="flex justify-between">
                  <dt className="text-subtle">Deployed</dt>
                  <dd>{deployedPct.toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-subtle">Cash</dt>
                  <dd>{(100 - deployedPct).toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2.5">
                  <dt className="text-subtle">Total equity</dt>
                  <dd>{formatINR(equity)}</dd>
                </div>
              </dl>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The separate closed-session practice account; it never touches the main paper book. */
function PracticeAccountCard() {
  const practice = usePracticeBook();
  const fund = useFundPractice();
  const account = practice.data?.account;
  return (
    <Card delay={230}>
      <CardHead title="Practice account" meta="Last-session practice only" />
      <div className="space-y-3 p-5 text-[12px]">
        <p className="leading-relaxed text-subtle">
          When the market is closed, stock tickets can practise at the last-session price. Those
          trades settle here, separately from your main paper book and its risk window.
        </p>
        {practice.isLoading ? (
          <p className="text-subtle">Loading…</p>
        ) : (
          <dl className="space-y-1.5 font-mono text-[11px] num-tabular">
            <div className="flex justify-between">
              <dt className="text-subtle">Cash</dt>
              <dd>{formatINR(Number(account?.wallet_balance ?? 0), { exact: true })}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-subtle">Holdings</dt>
              <dd>
                {practice.data?.holdings.length
                  ? practice.data.holdings.map((h) => `${h.symbol} ${h.quantity}`).join(", ")
                  : "None"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-subtle">Realised P&amp;L</dt>
              <dd>{formatINR(Number(account?.profit ?? 0), { exact: true })}</dd>
            </div>
          </dl>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={fund.isPending}
          onClick={() =>
            fund.mutate(100_000, {
              onError: (error) => toast.error(tradingErrorMessage(error)),
              onSuccess: () => toast.success("Added ₹1,00,000 of practice funds"),
            })
          }
        >
          Add ₹1,00,000 practice funds
        </Button>
      </div>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR, useAccount } from "@/hooks/use-dashboard-data";
import { tradingErrorMessage, useFundWallet } from "@/hooks/use-wallet";
import { cn } from "@/lib/utils";

const presets = [
  { label: "₹1 L", value: 100_000 },
  { label: "₹10 L", value: 1_000_000 },
  { label: "₹50 L", value: 5_000_000 },
  { label: "₹1 Cr", value: 10_000_000 },
  { label: "₹2 Cr", value: 20_000_000 },
];

/**
 * First-run funding step. A brand new account has no cash, so the terminal asks
 * how much simulated capital to start with before any order can be placed.
 */
export function WalletGate() {
  const { data: account, isLoading } = useAccount();
  const fund = useFundWallet();
  const [amount, setAmount] = useState(20_000_000);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = !isLoading && !!account && !account.onboarded;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const value = custom ? Number(custom.replace(/[^0-9.]/g, "")) || 0 : amount;

  async function submit() {
    setError(null);
    if (value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    try {
      await fund.mutateAsync({ amount: value });
    } catch (err) {
      setError(tradingErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-8">
      <div aria-hidden="true" className="absolute inset-0 bg-background/85 backdrop-blur-md" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-gate-title"
        className="dash-rise relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-panel/95 shadow-2xl"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
        />
        <div className="px-6 pt-7 pb-6 sm:px-8">
          <p className="flex items-center gap-2 font-mono text-[9px] tracking-[0.22em] uppercase text-primary-soft">
            <Wallet className="h-3.5 w-3.5" /> Fund your wallet
          </p>
          <h2 id="wallet-gate-title" className="mt-3 text-[1.6rem] leading-tight tracking-tight">
            How much capital do you want to start with?
          </h2>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            Every buy order is deducted from this wallet and every sell returns cash to it. The
            capital is simulated — no real money or broker is involved.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {presets.map((preset) => {
              const active = !custom && amount === preset.value;
              return (
                <Button
                  key={preset.value}
                  variant="outline"
                  onClick={() => {
                    setAmount(preset.value);
                    setCustom("");
                  }}
                  aria-pressed={active}
                  className={cn(
                    "h-10 font-mono text-[11px] tracking-[0.14em]",
                    active && "border-primary/50 bg-primary/10 text-primary-soft",
                  )}
                >
                  {preset.label}
                </Button>
              );
            })}
          </div>

          <label className="mt-5 block">
            <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
              Or enter an amount
            </span>
            <span className="mt-2 flex items-center border border-border bg-background/40 px-3">
              <span className="font-mono text-sm text-subtle">₹</span>
              <input
                inputMode="numeric"
                value={custom}
                placeholder="e.g. 2500000"
                onChange={(event) => setCustom(event.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3 text-right font-mono text-base outline-none"
              />
            </span>
          </label>

          <p className="mt-5 font-mono text-[11px] num-tabular text-muted-foreground">
            Starting balance · <span className="text-foreground">{formatINR(value)}</span>
          </p>

          {error && <p className="mt-3 text-[12.5px] text-negative">{error}</p>}

          <Button
            onClick={() => void submit()}
            disabled={fund.isPending}
            className="mt-6 h-12 w-full font-mono text-[11px] tracking-[0.18em]"
          >
            {fund.isPending ? <Loader2 className="animate-spin" /> : null}
            Add {formatINR(value)} to wallet
          </Button>
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">
            You can add or withdraw simulated funds later from the Wallet page.
          </p>
        </div>
      </div>
    </div>
  );
}

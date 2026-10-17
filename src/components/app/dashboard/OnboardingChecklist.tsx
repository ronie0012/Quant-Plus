import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { Card } from "@/components/app/cards";
import { useAccount } from "@/hooks/use-dashboard-data";
import { useJournal, usePriceAlerts } from "@/hooks/use-trading-product";
import { cn } from "@/lib/utils";

const KEY = "qp-onboarding-dismissed";

/** First-session guide: fund wallet → make a paper decision → first alert → review. */
export function OnboardingChecklist() {
  const { data: account } = useAccount();
  const { data: alerts } = usePriceAlerts();
  const { data: journal } = useJournal();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => setDismissed(localStorage.getItem(KEY) === "1"), []);

  const steps = [
    {
      label: "Fund your wallet",
      done: Number(account?.wallet_balance ?? 0) > 0 || Boolean(account?.onboarded),
      to: "/app/wallet",
    },
    {
      label: "Make a paper decision (or watch only)",
      done: (journal ?? []).some((entry) => Boolean(entry.plan)),
      to: "/app/journal",
    },
    { label: "Set a price alert", done: (alerts ?? []).length > 0, to: "/app/alerts" },
    {
      label: "Review the decision",
      done: (journal ?? []).some((entry) => Boolean(entry.reflection)),
      to: "/app/journal",
    },
  ] as const;
  const count = steps.filter((s) => s.done).length;
  if (dismissed || count === steps.length || !account) return null;

  return (
    <Card className="dash-rise p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-primary-soft">
            Getting started · {count}/{steps.length}
          </p>
          <h2 className="mt-1 text-lg">Your first session in four steps</h2>
        </div>
        <button
          type="button"
          aria-label="Dismiss guide"
          onClick={() => {
            localStorage.setItem(KEY, "1");
            setDismissed(true);
          }}
          className="text-subtle hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 h-1 bg-border">
        <div
          className="h-full bg-primary transition-[width] duration-700"
          style={{ width: `${(count / steps.length) * 100}%` }}
        />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              to="/app/$section"
              params={{ section: s.to.replace("/app/", "") }}
              className={cn(
                "flex items-center gap-3 border border-border px-3 py-3 text-sm transition-colors hover:border-border-strong",
                s.done && "border-positive/30 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center border font-mono text-[10px]",
                  s.done
                    ? "border-positive/50 bg-positive/10 text-positive"
                    : "border-border text-subtle",
                )}
              >
                {s.done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn(s.done && "line-through")}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

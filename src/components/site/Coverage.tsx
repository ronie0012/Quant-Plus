import { Disclosure } from "./Disclosure";
import { Eyebrow, SectionShell } from "./primitives";

export function Coverage() {
  return (
    <SectionShell
      id="availability"
      labelledBy="availability-title"
      className="border-t border-border bg-surface"
    >
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <Eyebrow>Availability</Eyebrow>
          <h2 id="availability-title" className="mt-5 text-3xl leading-tight tracking-tight">
            Know what you are working with.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Paper trading uses virtual funds. Market observations require a connected provider;
            missing quotes are not replaced with sample prices.
          </p>
        </div>
        <div className="space-y-3">
          <Disclosure title="Market coverage and freshness">
            <p>
              Indian cash equities and NSE index context are the focus. Actual instrument coverage,
              timestamps and delays depend on the provider and are shown in the terminal. A
              closed-session snapshot is not a live quote.
            </p>
          </Disclosure>
          <Disclosure title="Paper execution and risk controls">
            <p>
              The paper book records virtual deposits and simulated fills. An eligible quote and
              server-side checks are required for execution. Paper outcomes do not reproduce
              real-world liquidity or guarantee a real trading result. No real broker orders are
              placed.
            </p>
          </Disclosure>
          <Disclosure title="AI, options and replay limitations">
            <p>
              AI research is generated on request when its service is available. Its opinions are
              not validated forecast probabilities. Observed contracts are required for options and
              recorded sessions for replay; these tools remain unavailable when those inputs are
              missing.
            </p>
          </Disclosure>
        </div>
      </div>
    </SectionShell>
  );
}

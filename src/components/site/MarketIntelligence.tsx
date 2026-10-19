import { CapabilitySection } from "./CapabilitySection";
import { GhostAction } from "./primitives";

export function MarketIntelligence() {
  return (
    <CapabilitySection
      id="market-workflow"
      eyebrow="From a stock to a view"
      title="Read the context before the price."
      body="Use the terminal to explore NIFTY 50 companies and available NSE market context. This public page describes the workflow; it does not publish a live market tape."
      items={[
        {
          title: "Find a company",
          body: "Search by stock, inspect its detail page and keep relevant names in your watchlist.",
        },
        {
          title: "Check the observation",
          body: "Read the provider, timestamp and session state. Missing prices and history stay unavailable.",
        },
        {
          title: "Build the context",
          body: "Compare available price history, technical factors and relevant news before forming a thesis.",
        },
      ]}
    >
      <GhostAction to="/app/markets">Browse stocks in the terminal</GhostAction>
    </CapabilitySection>
  );
}

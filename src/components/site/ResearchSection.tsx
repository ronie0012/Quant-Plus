import { CapabilitySection } from "./CapabilitySection";
import { Disclosure } from "./Disclosure";
import { GhostAction } from "./primitives";

export function ResearchSection() {
  return (
    <CapabilitySection
      id="research-process"
      eyebrow="A repeatable process"
      title="Give every thesis a counter-case."
      body="Research starts with a question, not a buy or sell verdict. Use available observations to build a view you can revisit when the evidence changes."
      items={[
        {
          title: "Establish the facts",
          body: "Check sources, observation times and missing inputs. News, price history and calculated factors answer different questions.",
        },
        {
          title: "Challenge the idea",
          body: "State what must be true and what would make it wrong. Compare supporting evidence with the strongest counter-case.",
        },
        {
          title: "Record the decision",
          body: "Keep a decision plan and journal entry. If you practise the idea, set paper risk limits before placing an order yourself.",
        },
      ]}
    >
      <div className="space-y-3">
        <Disclosure title="Where signals and the Ripple map fit">
          <p>
            Technical factors describe available observations; they are not reliable forecasts by
            default. The Ripple map traces curated relationships between events and Indian
            companies. A plausible connection does not establish causation or predict the size of a
            price move.
          </p>
        </Disclosure>
        <Disclosure title="Research availability and evaluation">
          <p>
            Research is generated on request when the required services and evidence are available.
            Inspect progress, failures and evidence cutoffs in the workspace. Model opinions remain
            under evaluation; a confidence label is not a validated probability of profit.
          </p>
        </Disclosure>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <GhostAction to="/app/research">Open research workspace</GhostAction>
        <GhostAction to="/app/ripple">Explore the Ripple map</GhostAction>
      </div>
    </CapabilitySection>
  );
}

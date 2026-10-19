import { CapabilitySection } from "./CapabilitySection";
import { Disclosure } from "./Disclosure";
import { GhostAction } from "./primitives";

export function AIAnalyst() {
  return (
    <CapabilitySection
      id="analyst-workflow"
      eyebrow="A research companion"
      title="Ask, inspect, then decide for yourself."
      body="The analyst can help explain available market and paper-account context. Its answers may be incomplete or wrong; check the evidence rather than treating a fluent answer as a trading signal."
      items={[
        {
          title: "Frame a useful question",
          body: "Ask about an observation, a risk or an alternative explanation. Keep the company and time horizon explicit.",
        },
        {
          title: "Inspect the answer",
          body: "Review the supplied sources, observation times and missing inputs. Ask what evidence would change the conclusion.",
        },
        {
          title: "Keep control",
          body: "Use the answer as research context. The analyst has no authority to place real broker orders; you submit paper orders yourself.",
        },
      ]}
    >
      <div className="space-y-3">
        <Disclosure title="Questions to try in the workspace">
          <p className="mb-4">Example prompts only — opening this list does not run a model.</p>
          <ul className="list-disc space-y-3 pl-5">
            <li>What evidence supports and contradicts my thesis on this company?</li>
            <li>Which inputs are missing or stale in this analysis?</li>
            <li>How concentrated is my paper portfolio, based on the available holdings?</li>
          </ul>
        </Disclosure>
        <Disclosure title="Service availability and model limitations">
          <p>
            Answers require an available AI service and relevant inputs. Missing market feeds cannot
            be recovered by asking the model to guess. Research quality is under evaluation, and
            neither confidence labels nor model agreement are validated forecast probabilities. AI
            output is not investment advice.
          </p>
        </Disclosure>
      </div>
      <div className="mt-6">
        <GhostAction to="/app/quant-ai">Open AI workspace</GhostAction>
      </div>
    </CapabilitySection>
  );
}

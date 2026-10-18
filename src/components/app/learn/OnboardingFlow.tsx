import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Coffee, GraduationCap, LayoutDashboard, Sparkles } from "lucide-react";
import { WalletGate } from "@/components/app/WalletGate";
import { Questionnaire } from "@/components/app/learn/InvestorDnaPage";
import { useAccount } from "@/hooks/use-dashboard-data";
import { useInvestorDna, useLearning } from "@/hooks/use-learning";
import { PRACTICE_NOTES, RISK_LABELS } from "@/lib/learn/investor-dna";
import { cn } from "@/lib/utils";

const STEPS = 3;

/**
 * First-run flow for a new account, in order:
 *   1. Investor DNA ("Tell us about you")
 *   2. Fund the practice wallet
 *   3. Your learning path
 * Existing accounts (already funded) are never interrupted; they reach the
 * same pages from Home and More.
 */
export function OnboardingFlow() {
  const account = useAccount();
  const dna = useInvestorDna();
  const { learning, loading, setOnboarding } = useLearning();
  if (account.isLoading || !account.data || dna.loading || loading) return null;

  const newAccount = !account.data.onboarded;
  if (newAccount && !dna.complete && learning.onboarding == null)
    return <AboutYouStep dna={dna} onDone={() => void setOnboarding("WELCOME")} />;
  if (newAccount) return <WalletGate step={{ current: 2, total: STEPS }} />;
  if (learning.onboarding === "WELCOME")
    return <LearningPathStep dna={dna} onDone={() => void setOnboarding("DONE")} />;
  return null;
}

function Overlay({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto px-4 py-8">
      <div aria-hidden="true" className="fixed inset-0 bg-background/85 backdrop-blur-md" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="dash-rise relative mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center"
      >
        {children}
      </div>
    </div>
  );
}

function StepHeader({
  step,
  id,
  title,
  body,
}: {
  step: number;
  id: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mb-4 px-1">
      <div className="flex items-center gap-2" aria-hidden="true">
        {Array.from({ length: STEPS }, (_, i) => (
          <span
            key={i}
            className={cn("h-1 flex-1 rounded-full", i < step ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
      <p className="mt-4 text-[11px] font-medium tracking-[0.06em] text-primary-soft uppercase">
        Step {step} of {STEPS}
      </p>
      <h2 id={id} className="mt-1.5 text-[1.6rem] leading-tight font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function AboutYouStep({
  dna,
  onDone,
}: {
  dna: ReturnType<typeof useInvestorDna>;
  onDone: () => void;
}) {
  return (
    <Overlay labelledBy="onboarding-about-title">
      <StepHeader
        step={1}
        id="onboarding-about-title"
        title="Welcome to Quant Plus. Tell us about you."
        body="Eight quick questions about your money and your nerves. Your answers size your practice limits and shape what you learn first. They stay on this device."
      />
      <Questionnaire
        initial={dna.answers}
        saving={dna.saving}
        failed={Boolean(dna.saveError)}
        className="max-w-none"
        cancelLabel="Skip for now"
        submitLabel="Continue"
        onCancel={onDone}
        onSubmit={async (answers) => {
          await dna.save(answers);
          onDone();
        }}
      />
    </Overlay>
  );
}

function LearningPathStep({
  dna,
  onDone,
}: {
  dna: ReturnType<typeof useInvestorDna>;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const beginner = !dna.complete || ["NONE", "UNDER_1Y"].includes(dna.answers.experience ?? "NONE");
  const go = (section: string | null) => {
    onDone();
    void (section
      ? navigate({ to: "/app/$section", params: { section } })
      : navigate({ to: "/app/dashboard" }));
  };
  const options = [
    {
      section: "be-the-company",
      icon: Coffee,
      title: "Start with the basics",
      body: "Run a chai brand to its IPO and learn what a share really is. About 10 minutes.",
      recommended: beginner,
    },
    {
      section: "learn",
      icon: GraduationCap,
      title: "See my learning path",
      body: "Your trading licence, the AI tutor and today's ripple question.",
      recommended: !beginner,
    },
    {
      section: null,
      icon: LayoutDashboard,
      title: "Explore the terminal",
      body: "Go straight to Home. Learning stays one click away.",
      recommended: false,
    },
  ].sort((a, b) => Number(b.recommended) - Number(a.recommended));

  return (
    <Overlay labelledBy="onboarding-path-title">
      <StepHeader
        step={3}
        id="onboarding-path-title"
        title="Your learning path is ready"
        body="Everyone starts with a Learner licence. You earn the next one through discipline — stop-losses, small planned risk and calm exits — never through profit."
      />
      <div className="overflow-hidden rounded-xl border border-border bg-panel/95 shadow-2xl">
        {dna.complete && dna.practice && (
          <div className="flex gap-3 border-b border-border px-5 py-4">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                Your practice profile: {RISK_LABELS[dna.practice]}.{" "}
              </span>
              {PRACTICE_NOTES[dna.practice]}
            </p>
          </div>
        )}
        <ul className="divide-y divide-border">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <li key={option.title}>
                <button
                  type="button"
                  onClick={() => go(option.section)}
                  className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-panel-elevated"
                >
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
                      option.recommended
                        ? "border-primary/50 bg-primary/10 text-primary-soft"
                        : "border-border bg-panel-elevated text-subtle",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[14px] font-semibold">
                      {option.title}
                      {option.recommended && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary-soft">
                          Recommended
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                      {option.body}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-soft"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Overlay>
  );
}

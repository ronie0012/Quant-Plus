import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Coffee, GraduationCap, LayoutDashboard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Questionnaire } from "@/components/app/learn/InvestorDnaPage";
import { useAccount } from "@/hooks/use-dashboard-data";
import { useInvestorDna, useLearning } from "@/hooks/use-learning";
import { PRACTICE_NOTES, RISK_LABELS } from "@/lib/learn/investor-dna";
import { cn } from "@/lib/utils";

const STEPS = 2;
const DISMISSED_KEY = "quant-plus:welcome-dismissed";

/**
 * First-run flow for a new account, in order:
 *   1. Investor DNA ("Tell us about you")
 *   2. Choose a learning activity. Wallet funding remains optional.
 * Learn's "Getting started" action recovers this flow, including a tab-local draft.
 */
export function OnboardingFlow() {
  const account = useAccount();
  const dna = useInvestorDna();
  const { learning, loading, setOnboarding } = useLearning();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [dismissed, setDismissed] = useState(true);
  const [resumed, setResumed] = useState(false);
  const [path, setPath] = useState(false);
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISSED_KEY) === "true");
    } catch {
      setDismissed(false);
    }
    const resume = () => {
      setDismissed(false);
      setResumed(true);
      setPath(false);
    };
    window.addEventListener("quant-plus:resume-onboarding", resume);
    return () => window.removeEventListener("quant-plus:resume-onboarding", resume);
  }, []);
  const dismiss = () => {
    setDismissed(true);
    setResumed(false);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      /* Optional tab preference. */
    }
  };
  if (account.isLoading || !account.data || dna.loading || loading) return null;
  // A direct lesson link is already an intentional starting point.
  if (!resumed && /^\/app\/(investor-dna|be-the-company|tutor)\/?$/.test(pathname)) return null;

  const newAccount = !account.data.onboarded;
  if (dismissed || (!resumed && learning.onboarding === "DONE")) return null;
  const eligible =
    resumed || (newAccount && learning.onboarding == null) || learning.onboarding === "WELCOME";
  if (!eligible) return null;
  if (!dna.complete && !path && learning.onboarding !== "WELCOME")
    return (
      <AboutYouStep
        dna={dna}
        onDismiss={dismiss}
        onDone={async () => {
          await setOnboarding("WELCOME");
          setPath(true);
        }}
      />
    );
  if (eligible)
    return (
      <LearningPathStep
        dna={dna}
        onDismiss={dismiss}
        onDone={() => {
          dismiss();
          void setOnboarding("DONE").catch(() => {
            /* Tab dismissal still permits recovery. */
          });
        }}
      />
    );
  return null;
}

function Overlay({
  labelledBy,
  onDismiss,
  children,
}: {
  labelledBy: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previous;
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby="welcome-recovery"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((element) => !element.matches(":disabled") && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-border bg-panel p-4 text-foreground shadow-2xl backdrop:bg-background/85 backdrop:backdrop-blur-md sm:p-6"
    >
      <div className="mb-3 flex justify-end">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onDismiss}>
          Close welcome
        </Button>
      </div>
      {children}
      <p id="welcome-recovery" className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Come back through Learning → Getting started. Your unfinished answers stay in this browser
        tab. No wallet funding or trades are required.
      </p>
    </dialog>
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
  onDismiss,
}: {
  dna: ReturnType<typeof useInvestorDna>;
  onDone: () => Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <Overlay labelledBy="onboarding-about-title" onDismiss={onDismiss}>
      <StepHeader
        step={1}
        id="onboarding-about-title"
        title="Start with your Investor DNA"
        body="Eight optional questions: capacity is your financial ability to absorb a loss; tolerance is your comfort with risk. The more cautious answer shapes paper practice. Completed answers are saved with your workspace, not just this device."
      />
      <Questionnaire
        initial={dna.answers}
        saving={dna.saving}
        failed={Boolean(dna.saveError)}
        className="max-w-none"
        draftKey="quant-plus:investor-dna-draft"
        submitLabel="Continue"
        onCancel={undefined}
        onSubmit={async (answers) => {
          await dna.save(answers);
          await onDone();
        }}
      />
      <Button
        type="button"
        variant="ghost"
        className="mt-3 min-h-11"
        disabled={dna.saving}
        onClick={() => void onDone().catch(onDismiss)}
      >
        Skip questions · Choose a lesson
      </Button>
    </Overlay>
  );
}

function LearningPathStep({
  dna,
  onDone,
  onDismiss,
}: {
  dna: ReturnType<typeof useInvestorDna>;
  onDone: () => void;
  onDismiss: () => void;
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
      body: "Follow the suggested order and continue where you left off.",
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
    <Overlay labelledBy="onboarding-path-title" onDismiss={onDismiss}>
      <StepHeader
        step={2}
        id="onboarding-path-title"
        title="Your learning path is ready"
        body="Choose one activity to begin. Your practice licence is an in-app milestone earned through learning and discipline, not profit or a qualification to invest. You can set up virtual funds later from Wallet."
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
                  className="group flex min-h-11 w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-panel-elevated focus-visible:outline-2 focus-visible:outline-primary"
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
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
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

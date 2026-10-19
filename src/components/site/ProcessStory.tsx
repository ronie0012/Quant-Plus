import { Link, linkOptions } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Eyebrow, SectionShell } from "./primitives";

const steps = [
  {
    title: "Learn before you size",
    body: "Start with your investor profile and the learning path. Build habits around risk, not a promised return.",
    label: "Go to learning",
    link: linkOptions({ to: "/app/$section", params: { section: "learn" } }),
  },
  {
    title: "Follow an idea through",
    body: "Explore a stock or use the Ripple map to understand how an event could reach other Indian companies.",
    label: "Explore the Ripple map",
    link: linkOptions({ to: "/app/$section", params: { section: "ripple" } }),
  },
  {
    title: "Plan, practise, review",
    body: "Add virtual funds, set limits and record a paper decision. Return to your journal to review what changed.",
    label: "Open paper terminal",
    link: linkOptions({ to: "/app/dashboard" }),
  },
] as const;

export function ProcessStory() {
  return (
    <SectionShell
      id="getting-started"
      labelledBy="getting-started-title"
      className="border-t border-border"
    >
      <Eyebrow>Getting started</Eyebrow>
      <h2
        id="getting-started-title"
        className="mt-5 text-3xl leading-tight tracking-tight sm:text-4xl"
      >
        A practical route from learning to doing.
      </h2>
      <ol className="mt-10 grid gap-6 lg:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex flex-col border-t border-border-strong pt-6">
            <span aria-hidden="true" className="font-mono text-xs text-primary-soft">
              0{i + 1}
            </span>
            <h3 className="mt-4 text-xl tracking-tight">{step.title}</h3>
            <p className="mt-3 mb-5 text-base leading-relaxed text-muted-foreground">{step.body}</p>
            <Link
              {...step.link}
              preload={false}
              className="mt-auto inline-flex min-h-11 items-center gap-3 self-start text-sm text-primary-soft hover:text-foreground"
            >
              {step.label}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}

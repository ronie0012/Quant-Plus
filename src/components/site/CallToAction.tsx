import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PrimaryAction, SectionShell } from "./primitives";

export function CallToAction({
  heading = "Put your next idea into practice.",
  body = "Open your personal paper workspace, or build a foundation in the learning path first.",
  secondary = { label: "Start learning", to: "/app/learn" },
}: {
  heading?: string;
  body?: string;
  secondary?: { label: string; to: string };
}) {
  return (
    <SectionShell labelledBy="next-step-title" className="border-t border-border bg-surface">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto] lg:gap-12">
        <div>
          <p className="label-tech text-primary-soft">Your next step</p>
          <h2
            id="next-step-title"
            className="mt-4 text-2xl leading-tight tracking-tight sm:text-3xl"
          >
            {heading}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">{body}</p>
        </div>
        <div className="flex flex-col items-start gap-3">
          <PrimaryAction to="/app/dashboard">Open paper terminal</PrimaryAction>
          <Link
            to={secondary.to}
            preload={false}
            className="inline-flex min-h-11 items-center gap-3 text-sm text-primary-soft hover:text-foreground"
          >
            {secondary.label}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </SectionShell>
  );
}

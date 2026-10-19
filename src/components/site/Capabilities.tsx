import { Link, linkOptions } from "@tanstack/react-router";
import { ArrowRight, BookOpen, BrainCircuit, ChartNoAxesCombined, NotebookPen } from "lucide-react";
import { Eyebrow, SectionShell } from "./primitives";

const areas = [
  {
    title: "Explore markets",
    body: "Find Indian stocks and understand source-labelled prices, history and market context.",
    link: linkOptions({ to: "/markets" }),
    icon: ChartNoAxesCombined,
  },
  {
    title: "Build a research view",
    body: "Separate observations from interpretation, and test a thesis against its counter-case.",
    link: linkOptions({ to: "/research" }),
    icon: NotebookPen,
  },
  {
    title: "Ask the AI analyst",
    body: "Use questions to explore available evidence, then check the answer and its limits.",
    link: linkOptions({ to: "/ai" }),
    icon: BrainCircuit,
  },
  {
    title: "Learn by doing",
    body: "Build market knowledge, explore your investor profile and practise with paper money.",
    link: linkOptions({ to: "/app/$section", params: { section: "learn" } }),
    icon: BookOpen,
  },
] as const;

export function Capabilities() {
  return (
    <SectionShell labelledBy="explore-title">
      <Eyebrow>Find your starting point</Eyebrow>
      <h2 id="explore-title" className="mt-5 text-3xl leading-tight tracking-tight sm:text-4xl">
        A place for every part of the process.
      </h2>
      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        {areas.map(({ title, body, link, icon: Icon }) => (
          <li key={title}>
            <Link
              {...link}
              preload={false}
              className="group flex h-full flex-col border border-border bg-panel p-6 transition-colors duration-200 hover:border-border-strong hover:bg-panel-elevated focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-soft sm:p-8"
            >
              <Icon aria-hidden="true" className="h-5 w-5 text-primary-soft" />
              <h3 className="mt-5 flex items-center justify-between gap-4 text-xl tracking-tight">
                {title}
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-soft" />
              </h3>
              <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground">
                {body}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { researchDesks, series, toPath } from "@/data/market";

export function ResearchSection() {
  return (
    <SectionShell id="research" className="border-t border-border">
      <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>Research desk</Eyebrow>
          <h2 className="display-section mt-7">Research without the noise.</h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Each desk answers one question and states what the data does not support. No filler, no
          recycled commentary.
        </p>
      </Reveal>

      <ul className="mt-16 grid gap-px border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
        {researchDesks.map((desk, i) => (
          <Reveal
            as="li"
            key={desk.code}
            delay={i * 60}
            className="group relative bg-background p-5 transition-colors duration-500 hover:bg-panel sm:p-7"
          >
            <span
              aria-hidden="true"
              className="absolute top-0 left-0 h-px w-0 bg-primary transition-all duration-700 group-hover:w-full"
            />
            <div className="flex items-center justify-between">
              <span className="label-tech">{desk.code}</span>
              <span className="font-mono text-[10px] tracking-[0.16em] text-subtle opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                {desk.meta}
              </span>
            </div>

            <h3 className="mt-8 text-xl tracking-tight">{desk.title}</h3>
            <p className="mt-3 min-h-[3.5rem] text-sm leading-relaxed text-muted-foreground">
              {desk.body}
            </p>

            <svg viewBox="0 0 260 54" className="mt-6 h-[54px] w-full" aria-hidden="true">
              <path
                d={toPath(series(desk.seed, 40, 0.3), 260, 54, 4)}
                fill="none"
                strokeWidth="1"
                className="stroke-border-strong transition-all duration-700 group-hover:stroke-primary"
              />
            </svg>

            <div className="mt-6 flex gap-8 border-t border-border pt-5">
              {desk.metrics.map((m) => (
                <div key={m.label}>
                  <span className="label-tech text-[10px]">{m.label}</span>
                  <p className="mt-2 font-mono text-sm transition-colors duration-500 group-hover:text-primary-soft">
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        ))}
      </ul>
    </SectionShell>
  );
}

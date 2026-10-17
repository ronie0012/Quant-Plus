import { Eyebrow, SectionShell } from "./primitives";
import { Reveal, RevealGroup } from "./Reveal";

/** Product descriptions carry no simulated observations or performance claims. */
export function CapabilitySection({
  id,
  eyebrow,
  title,
  body,
  items,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  items: readonly string[];
}) {
  return (
    <SectionShell id={id} labelledBy={`${id}-title`} className="border-t border-border bg-surface">
      <>
        <Reveal variant="blur">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 id={`${id}-title`} className="display-section mt-7 max-w-3xl">
            {title}
          </h2>
          <p className="mt-7 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {body}
          </p>
        </Reveal>
        <RevealGroup
          as="ol"
          stagger={110}
          delay={120}
          className="mt-12 grid gap-px border border-border bg-border md:grid-cols-3"
          itemClassName="group relative overflow-hidden bg-panel p-7 text-sm leading-relaxed transition-colors duration-500 hover:bg-panel-elevated"
        >
          {items.map((item, i) => (
            <div key={item}>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-primary transition-transform duration-700 [transition-timing-function:var(--ease-out-expo)] group-hover:scale-x-100"
              />
              <span className="font-mono text-[10px] tracking-[0.2em] text-primary-soft">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="mt-4 block">{item}</span>
            </div>
          ))}
        </RevealGroup>
      </>
    </SectionShell>
  );
}

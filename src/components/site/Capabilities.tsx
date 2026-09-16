import { Eyebrow, SectionShell } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { capabilities } from "@/data/market";

export function Capabilities() {
  return (
    <SectionShell className="border-t border-border">
      <Reveal className="max-w-3xl">
        <Eyebrow>Capabilities</Eyebrow>
        <h2 className="display-section mt-7">
          Everything you need.
          <span className="block text-muted-foreground">One intelligence layer.</span>
        </h2>
      </Reveal>

      <ul className="mt-16 border-t border-border">
        {capabilities.map((cap, i) => (
          <Reveal as="li" key={cap.index} delay={i * 70} className="group border-b border-border">
            <div className="relative grid gap-4 py-8 transition-colors duration-500 md:grid-cols-12 md:items-baseline md:py-10">
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 h-px w-0 bg-primary transition-all duration-700 group-hover:w-full"
              />
              <span className="label-tech md:col-span-1">{cap.index}</span>
              <h3 className="font-mono text-lg tracking-[0.08em] uppercase transition-colors duration-500 group-hover:text-primary-soft md:col-span-5 md:text-xl">
                {cap.title}
              </h3>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:col-span-6">
                {cap.body}
              </p>
            </div>
          </Reveal>
        ))}
      </ul>
    </SectionShell>
  );
}

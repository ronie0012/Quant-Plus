import { Eyebrow } from "@/components/site/primitives";
import { MarketField } from "@/components/visuals/MarketField";

export function PageHeader({
  eyebrow,
  heading,
  body,
  meta,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  meta?: string[];
}) {
  return (
    <header className="relative overflow-hidden border-b border-border pt-36 pb-20 md:pt-44 md:pb-28">
      <MarketField className="absolute inset-0 opacity-45" density="light" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--background) 92%, transparent))",
        }}
      />
      <div className="relative mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display-hero mt-7 max-w-3xl">{heading}</h1>
        <p className="mt-8 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {body}
        </p>
        {meta && (
          <div className="mt-12 flex flex-wrap gap-x-10 gap-y-3 border-t border-border pt-6">
            {meta.map((m) => (
              <span key={m} className="label-tech">
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

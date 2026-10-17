import { DashboardPreview } from "@/components/site/DashboardPreview";
import { Eyebrow } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { usePrefersReducedMotion, useScrollProgress } from "@/hooks/use-reveal";

/** Cinematic final reveal: the dashboard scales 0.82 → 1.0 on scroll. */
export function ProductShowcase() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const t = Math.max(0, Math.min(1, (progress - 0.08) / 0.55));
  const scale = reduced ? 1 : 0.82 + t * 0.18;
  const lift = reduced ? 0 : (1 - t) * 40;

  return (
    <section ref={ref} className="relative overflow-hidden border-t border-border py-24 md:py-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 42%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)",
        }}
      />
      <div
        className="grid-lines pointer-events-none absolute inset-0 opacity-25"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-[1500px] px-5 sm:px-8 lg:px-12">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center">
            <Eyebrow>The product</Eyebrow>
          </div>
          <h2 className="display-section mt-7">
            Quant Plus,
            <span className="block text-muted-foreground">end to end.</span>
          </h2>
        </Reveal>

        <div
          className="mt-16 will-change-transform"
          style={{
            transform: `scale(${scale.toFixed(3)}) translate3d(0, ${lift.toFixed(1)}px, 0)`,
            transition: "transform 220ms linear",
          }}
        >
          <div className="shadow-[0_60px_140px_-60px_rgba(0,0,0,0.9)]">
            <DashboardPreview stage={7} />
          </div>
        </div>
      </div>
    </section>
  );
}

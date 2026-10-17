import { useRef } from "react";
import { Eyebrow, GhostAction, PrimaryAction } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { Magnetic } from "@/components/site/Magnetic";
import { usePrefersReducedMotion } from "@/hooks/use-reveal";

export function CallToAction() {
  const glow = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  return (
    <section
      aria-labelledby="cta-title"
      className="relative overflow-hidden border-t border-border bg-background py-28 md:py-40"
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse" || !glow.current) return;
        const r = event.currentTarget.getBoundingClientRect();
        glow.current.style.setProperty("--gx", `${event.clientX - r.left}px`);
        glow.current.style.setProperty("--gy", `${event.clientY - r.top}px`);
      }}
    >
      <div
        ref={glow}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px circle at var(--gx, 70%) var(--gy, 40%), color-mix(in oklab, var(--color-primary) 14%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="grid-lines pointer-events-none absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]"
      />
      <div className="relative mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <Reveal variant="blur" className="max-w-3xl">
          <Eyebrow>The next generation of market intelligence</Eyebrow>
          <h2 id="cta-title" className="display-hero mt-8">
            Make the market
            <span className="block text-signal">make sense.</span>
          </h2>
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Magnetic>
              <PrimaryAction to="/auth" className="shadow-[0_18px_50px_-18px_var(--color-primary)]">
                Get Started
              </PrimaryAction>
            </Magnetic>
            <GhostAction to="/platform">Explore the platform</GhostAction>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

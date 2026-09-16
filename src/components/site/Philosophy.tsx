import { Reveal } from "@/components/site/Reveal";
import { useScrollProgress } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

const words = ["MARKETS", "NOISE", "SIGNAL", "INTELLIGENCE"];

export function Philosophy() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const t = Math.max(0, Math.min(1, (progress - 0.12) / 0.62));

  return (
    <section ref={ref} className="relative border-t border-border py-32 md:py-52">
      <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <Reveal className="max-w-4xl">
          <p className="display-section">
            Markets generate noise.
            <span className="block text-muted-foreground">Quant Plus finds the signal.</span>
          </p>
        </Reveal>

        <div className="mt-24 flex flex-wrap gap-x-10 gap-y-6 md:mt-36">
          {words.map((word, i) => {
            const lit = t > i / words.length;
            return (
              <span
                key={word}
                className={cn(
                  "font-mono text-xl tracking-[0.28em] transition-all duration-1000 sm:text-3xl lg:text-4xl",
                  lit
                    ? i === words.length - 1
                      ? "text-primary opacity-100"
                      : "text-foreground opacity-100"
                    : "translate-y-3 text-subtle opacity-25",
                )}
              >
                {word}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

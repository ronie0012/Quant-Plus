import { useEffect, useRef, useState } from "react";
import { Eyebrow } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";
import { STORY_ORDER } from "@/data/story";
import { usePrefersReducedMotion, useScrollProgress } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

/**
 * Scroll-driven product story: a sticky pipeline rail tracks the chapter
 * crossing the middle of the viewport. Every chapter stays in normal reading
 * order, so the section reads correctly without motion or a pointer.
 */
export function ProcessStory() {
  const [active, setActive] = useState(0);
  const chapters = useRef<(HTMLElement | null)[]>([]);
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setActive(Number((entry.target as HTMLElement).dataset["index"]));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of chapters.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Progress through the chapters only (the section has padding above and below).
  const fill = Math.min(1, Math.max(0, (progress - 0.12) / 0.72));
  const go = (index: number) =>
    chapters.current[index]?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });

  return (
    <section
      id="pipeline"
      aria-labelledby="pipeline-title"
      className="relative border-t border-border bg-surface py-24 md:py-36"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(900px 500px at 15% 20%, color-mix(in oklab, var(--color-primary) 9%, transparent), transparent 70%)",
        }}
      />
      <div ref={ref} className="relative mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <Reveal variant="blur" className="max-w-3xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="pipeline-title" className="display-section mt-7">
            From observation
            <span className="block text-muted-foreground">to a decision you can defend.</span>
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-12 lg:mt-24 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          <nav aria-label="Pipeline chapters" className="hidden lg:block">
            <div className="sticky top-28">
              <div className="relative pl-8">
                <span
                  aria-hidden="true"
                  className="absolute top-2 bottom-2 left-[7px] w-px bg-border-strong"
                />
                <span
                  aria-hidden="true"
                  className="absolute top-2 left-[7px] w-px origin-top bg-primary shadow-[0_0_12px_var(--color-primary)]"
                  style={{ height: "calc(100% - 1rem)", transform: `scaleY(${fill})` }}
                />
                <ol className="space-y-1">
                  {STORY_ORDER.map((chapter, i) => {
                    const on = i === active;
                    const passed = i < active;
                    return (
                      <li key={chapter.id} className="relative">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute top-1/2 -left-8 h-[15px] w-[15px] -translate-y-1/2 rounded-full border transition-all duration-500",
                            on
                              ? "scale-110 border-primary bg-primary shadow-[0_0_0_5px_color-mix(in_oklab,var(--color-primary)_22%,transparent)]"
                              : passed
                                ? "border-primary bg-background"
                                : "border-border-strong bg-background",
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => go(i)}
                          aria-current={on ? "step" : undefined}
                          className={cn(
                            "flex w-full items-baseline gap-4 py-2.5 text-left transition-all duration-500",
                            on
                              ? "translate-x-1 text-foreground"
                              : "text-subtle hover:text-muted-foreground",
                          )}
                        >
                          <span className="font-mono text-[10px] tracking-[0.2em]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-[12px] tracking-[0.16em] uppercase",
                              on && "text-primary-soft",
                            )}
                          >
                            {chapter.eyebrow}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <p
                className="mt-10 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground"
                aria-live="polite"
              >
                <span className="font-mono text-primary-soft">
                  {String(active + 1).padStart(2, "0")} /{" "}
                  {String(STORY_ORDER.length).padStart(2, "0")}
                </span>{" "}
                {STORY_ORDER[active]?.title}
              </p>
            </div>
          </nav>

          <ol className="space-y-6 lg:space-y-[18vh] lg:py-[12vh]">
            {STORY_ORDER.map((chapter, i) => {
              const on = i === active;
              return (
                <li
                  key={chapter.id}
                  id={chapter.id}
                  ref={(el) => {
                    chapters.current[i] = el;
                  }}
                  data-index={i}
                  className={cn(
                    "scroll-mt-32 rounded-lg border bg-panel/80 p-7 backdrop-blur-sm transition-all duration-700 [transition-timing-function:var(--ease-out-expo)] sm:p-9",
                    on
                      ? "border-primary/40 shadow-[0_40px_90px_-50px_color-mix(in_oklab,var(--color-primary)_55%,transparent)] lg:scale-100 lg:opacity-100"
                      : "border-border lg:scale-[0.97] lg:opacity-45",
                  )}
                >
                  <article aria-labelledby={`${chapter.id}-heading`}>
                    <p className="label-tech flex items-center gap-3">
                      <span className="font-mono text-primary-soft">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {chapter.eyebrow}
                    </p>
                    <h3
                      id={`${chapter.id}-heading`}
                      className="mt-5 text-[clamp(1.5rem,2.6vw,2.25rem)] leading-tight tracking-tight"
                    >
                      {chapter.title}
                    </h3>
                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                      {chapter.body}
                    </p>
                    <ul className="mt-7 space-y-3 border-t border-border pt-6">
                      {chapter.items.map((item, k) => (
                        <li
                          key={item}
                          className={cn(
                            "flex gap-3 text-[13.5px] leading-relaxed transition-all duration-700",
                            on ? "translate-x-0 opacity-100" : "lg:-translate-x-1 lg:opacity-70",
                          )}
                          style={{ transitionDelay: on ? `${120 + k * 90}ms` : "0ms" }}
                        >
                          <span
                            aria-hidden="true"
                            className="mt-[9px] h-px w-4 shrink-0 bg-primary"
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </article>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

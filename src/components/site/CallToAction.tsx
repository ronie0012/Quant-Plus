import { Eyebrow, GhostAction, PrimaryAction } from "@/components/site/primitives";
import { Reveal } from "@/components/site/Reveal";

export function CallToAction() {
  return (
    <section className="border-t border-border bg-background py-28 md:py-40">
      <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <Reveal className="max-w-3xl">
          <Eyebrow>The next generation of market intelligence</Eyebrow>
          <h2 className="display-hero mt-8">
            Make the market
            <span className="block text-muted-foreground">make sense.</span>
          </h2>
          <div className="mt-12 flex flex-wrap items-center gap-3">
            <PrimaryAction to="/auth">Get Started</PrimaryAction>
            <GhostAction to="/platform">Explore the Platform</GhostAction>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

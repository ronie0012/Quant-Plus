import { Eyebrow, GhostAction, PrimaryAction } from "./primitives";

export function PageHeader({
  eyebrow,
  heading,
  body,
  action,
  secondary,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  action: { label: string; to: string };
  secondary?: { label: string; to: string };
}) {
  return (
    <header className="border-b border-border bg-surface pt-32 pb-14 md:pt-36 md:pb-20">
      <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-6 max-w-4xl text-[clamp(2.25rem,4.5vw,4.25rem)] leading-[1.08] tracking-[-0.035em]">
          {heading}
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryAction to={action.to}>{action.label}</PrimaryAction>
          {secondary && <GhostAction to={secondary.to}>{secondary.label}</GhostAction>}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Paper workspace · Virtual funds only · Provider-dependent market data
        </p>
      </div>
    </header>
  );
}

import type { ReactNode } from "react";
import { Eyebrow, SectionShell } from "./primitives";

/** Product descriptions carry no simulated observations or performance claims. */
export function CapabilitySection({
  id,
  eyebrow,
  title,
  body,
  items,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  items: readonly (string | { title: string; body: string })[];
  children?: ReactNode;
}) {
  return (
    <SectionShell id={id} labelledBy={`${id}-title`}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2
          id={`${id}-title`}
          className="mt-5 max-w-3xl text-3xl leading-tight tracking-tight sm:text-4xl"
        >
          {title}
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {items.map((item, i) => (
          <li
            key={typeof item === "string" ? item : item.title}
            className="border border-border bg-panel p-6"
          >
            <span aria-hidden="true" className="font-mono text-xs text-primary-soft">
              {String(i + 1).padStart(2, "0")}
            </span>
            {typeof item === "string" ? (
              <p className="mt-4 text-base leading-relaxed">{item}</p>
            ) : (
              <>
                <h3 className="mt-4 text-lg tracking-tight">{item.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{item.body}</p>
              </>
            )}
          </li>
        ))}
      </ol>
      {children && <div className="mt-8">{children}</div>}
    </SectionShell>
  );
}

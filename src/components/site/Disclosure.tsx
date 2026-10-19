import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Native disclosure keeps supplementary detail keyboard-accessible without a JS dependency. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border border-border bg-panel">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium transition-colors hover:bg-panel-elevated focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-soft [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-primary-soft transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-border p-5 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

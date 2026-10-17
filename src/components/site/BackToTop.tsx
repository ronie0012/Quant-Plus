import { ArrowUp } from "lucide-react";
import { useDocumentProgress } from "@/hooks/use-live";
import { usePrefersReducedMotion } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

/** Appears after the first screen; its ring shows how far through the page you are. */
export function BackToTop() {
  const progress = useDocumentProgress();
  const reduced = usePrefersReducedMotion();
  const visible = progress > 0.12;
  const circumference = 2 * Math.PI * 19;
  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() => {
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
        document.getElementById("main-content")?.focus({ preventScroll: true });
      }}
      className={cn(
        "group fixed right-5 bottom-5 z-40 grid h-12 w-12 place-items-center rounded-full border border-border-strong bg-panel/85 text-muted-foreground backdrop-blur-md transition-all duration-500 [transition-timing-function:var(--ease-out-expo)] hover:text-foreground",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 44 44"
        className="absolute inset-0 h-full w-full -rotate-90"
      >
        <circle
          cx="22"
          cy="22"
          r="19"
          fill="none"
          strokeWidth="1.5"
          className="stroke-primary"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <ArrowUp className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5" />
    </button>
  );
}

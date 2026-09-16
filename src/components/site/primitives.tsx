import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("label-tech flex items-center gap-3", className)}>
      <span className="h-px w-8 bg-border-strong" aria-hidden="true" />
      {children}
    </p>
  );
}

export function SectionShell({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("relative w-full py-24 md:py-36", className)}>
      <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-12">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "primary";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="label-tech">{label}</span>
      <span
        className={cn(
          "font-mono text-lg tracking-tight sm:text-xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "primary" && "text-primary-soft",
        )}
      >
        {value}
      </span>
    </div>
  );
}

const baseAction =
  "group relative inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-all duration-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function PrimaryAction({
  children,
  to,
  className,
  onClick,
}: {
  children: ReactNode;
  to?: string;
  className?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      {children}
      <span
        aria-hidden="true"
        className="h-px w-5 bg-primary-foreground/60 transition-all duration-500 group-hover:w-8"
      />
    </>
  );
  const classes = cn(
    baseAction,
    "border border-primary/60 bg-primary px-6 py-3.5 text-primary-foreground hover:bg-primary-soft hover:border-primary-soft",
    className,
  );
  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

export function GhostAction({
  children,
  to,
  className,
  onClick,
}: {
  children: ReactNode;
  to?: string;
  className?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      {children}
      <span
        aria-hidden="true"
        className="h-px w-5 bg-border-strong transition-all duration-500 group-hover:w-8 group-hover:bg-primary"
      />
    </>
  );
  const classes = cn(
    baseAction,
    "border border-border-strong px-6 py-3.5 text-muted-foreground hover:text-foreground hover:border-foreground/30",
    className,
  );
  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

export function Panel({
  children,
  className,
  elevated,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  return (
    <div
      className={cn(
        "border border-border",
        elevated ? "bg-panel-elevated" : "bg-panel",
        className,
      )}
    >
      {children}
    </div>
  );
}

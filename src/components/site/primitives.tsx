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
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("relative w-full scroll-mt-24 py-16 md:py-24", className)}
    >
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
  "group relative inline-flex min-h-11 items-center justify-center gap-2.5 rounded-md text-[14px] font-medium transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-soft";

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
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      >
        &rarr;
      </span>
    </>
  );
  const classes = cn(
    baseAction,
    "border border-primary-action bg-primary-action px-5 py-2.5 text-primary-foreground hover:border-primary hover:bg-primary",
    className,
  );
  if (to) {
    return (
      <Link to={to} preload={false} className={classes}>
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
    "border border-border-strong bg-foreground/[0.03] px-5 py-2.5 text-foreground hover:border-foreground/30 hover:bg-foreground/[0.06]",
    className,
  );
  if (to) {
    return (
      <Link to={to} preload={false} className={classes}>
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
      className={cn("border border-border", elevated ? "bg-panel-elevated" : "bg-panel", className)}
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { Children } from "react";
import { useInView } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

type Variant = "up" | "left" | "right" | "scale" | "blur";

const initClass: Record<Variant, string> = {
  up: "reveal-init",
  left: "reveal-init-left",
  right: "reveal-init-right",
  scale: "reveal-init-scale",
  blur: "reveal-init-blur",
};

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: Variant;
  as?: "div" | "section" | "li" | "article" | "header" | "ul" | "ol";
}

export function Reveal({ children, className, delay = 0, variant = "up", as = "div" }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const Tag = as;
  const inClass = variant === "blur" ? "reveal-in-blur" : "reveal-in";

  return (
    <Tag
      ref={ref as never}
      className={cn(inView ? inClass : initClass[variant], className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Reveals each direct child in sequence. */
export function RevealGroup({
  children,
  className,
  stagger = 90,
  delay = 0,
  variant = "up",
  as = "div",
  itemClassName,
}: RevealProps & { stagger?: number; itemClassName?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.12 });
  const Tag = as;
  const inClass = variant === "blur" ? "reveal-in-blur" : "reveal-in";

  return (
    <Tag ref={ref as never} className={className}>
      {Children.map(children, (child, i) => (
        <div
          className={cn(inView ? inClass : initClass[variant], itemClassName)}
          style={{ transitionDelay: `${delay + i * stagger}ms` }}
        >
          {child}
        </div>
      ))}
    </Tag>
  );
}

import { useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reveal";

/**
 * Pulls its child a few pixels toward a fine pointer. Inert for touch input
 * and reduced motion, and never changes layout or the focus target.
 */
export function Magnetic({
  children,
  strength = 0.28,
}: {
  children: ReactNode;
  strength?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const reset = () => {
    if (ref.current) ref.current.style.transform = "translate3d(0,0,0)";
  };
  return (
    <span
      ref={ref}
      className="inline-flex transition-transform duration-500 [transition-timing-function:var(--ease-spring)] will-change-transform"
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse" || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const x = (event.clientX - (r.left + r.width / 2)) * strength;
        const y = (event.clientY - (r.top + r.height / 2)) * strength;
        ref.current.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }}
      onPointerLeave={reset}
      onBlur={reset}
    >
      {children}
    </span>
  );
}

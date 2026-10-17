import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reveal";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Animates a number from 0 (or `from`) to `target` once `active` becomes true. */
export function useCountUp(
  target: number,
  {
    active = true,
    duration = 1400,
    from = 0,
  }: { active?: boolean; duration?: number; from?: number } = {},
) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(active ? target : from);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (target - from) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, duration, from, reduced, target]);

  return value;
}

export function formatQuote(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Types out text character by character once `active` is true. */
export function useTypewriter(text: string, { active = true, speed = 32 } = {}) {
  const reduced = usePrefersReducedMotion();
  const [out, setOut] = useState("");

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setOut(text);
      return;
    }
    setOut("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [active, reduced, speed, text]);

  return { text: out, done: out.length === text.length };
}

/** Whole-document scroll progress, 0 → 1. */
export function useDocumentProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return progress;
}

/** Subtle pointer-follow parallax for cards. Returns handlers + transform values. */
export function usePointerTilt<T extends HTMLElement = HTMLDivElement>(strength = 6) {
  const ref = useRef<T | null>(null);
  const reduced = usePrefersReducedMotion();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const onPointerMove = (e: React.PointerEvent<T>) => {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * strength, y: px * strength });
  };
  const onPointerLeave = () => setTilt({ x: 0, y: 0 });

  return {
    ref,
    handlers: { onPointerMove, onPointerLeave },
    style: {
      transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
      transition: "transform 500ms cubic-bezier(0.16,1,0.3,1)",
    } as React.CSSProperties,
  };
}

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion, useVisible } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

interface MarketFieldProps {
  className?: string;
  /** 0 → 1, expands the field as the hero scrolls away. */
  expansion?: number;
  density?: "full" | "reduced";
}

interface FieldLine {
  y: number;
  amp: number;
  freq: number;
  speed: number;
  phase: number;
  alpha: number;
  hue: "white" | "grey" | "blue";
  width: number;
}

/**
 * Market Intelligence Field — the signature Quant Plus visual.
 * Thin evolving lines standing in for market waves, with rare bright
 * blue signal pulses travelling through the structure. Canvas 2D for
 * performance; simplified on small screens; static when reduced motion.
 */
export function MarketField({ className, expansion = 0, density = "full" }: MarketFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { ref: wrapRef, visible } = useVisible<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const expansionRef = useRef(expansion);
  expansionRef.current = expansion;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let lines: FieldLine[] = [];
    let raf = 0;
    let running = true;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const small = width < 760 || density === "reduced";
      const count = small ? 90 : Math.round(Math.min(260, width / 5.2));
      lines = Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1);
        const centreBias = 1 - Math.abs(t - 0.5) * 2;
        const r = pseudo(i * 3.77);
        const hue: FieldLine["hue"] = r > 0.94 ? "blue" : r > 0.6 ? "white" : "grey";
        return {
          y: t,
          amp: (6 + centreBias * (small ? 34 : 62)) * (0.5 + pseudo(i * 1.13)),
          freq: 0.6 + pseudo(i * 2.31) * 2.1,
          speed: 0.00016 + pseudo(i * 5.19) * 0.00042,
          phase: pseudo(i * 7.71) * Math.PI * 2,
          alpha: 0.05 + centreBias * 0.34 * (0.4 + pseudo(i * 4.03)),
          hue,
          width: hue === "blue" ? 0.9 : 0.6 + pseudo(i * 6.61) * 0.5,
        };
      });
    };

    // Signal pulse travelling through the structure.
    let pulse = { line: 0, x: -1, active: false, next: 900 };

    const draw = (time: number) => {
      const exp = expansionRef.current;
      ctx.clearRect(0, 0, width, height);
      const spread = 1 + exp * 0.85;
      const centre = height / 2;

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l) continue;
        const baseY = centre + (l.y - 0.5) * height * spread;
        if (baseY < -40 || baseY > height + 40) continue;

        const colour =
          l.hue === "blue"
            ? `rgba(110, 168, 255, ${(l.alpha * 0.9).toFixed(3)})`
            : l.hue === "white"
              ? `rgba(241, 243, 247, ${(l.alpha * 0.82).toFixed(3)})`
              : `rgba(138, 148, 166, ${(l.alpha * 0.6).toFixed(3)})`;

        ctx.beginPath();
        ctx.strokeStyle = colour;
        ctx.lineWidth = l.width;
        const step = width < 760 ? 14 : 9;
        for (let x = 0; x <= width; x += step) {
          const u = x / width;
          const t = time * l.speed;
          const wave =
            Math.sin(u * Math.PI * l.freq * 2 + t + l.phase) * l.amp +
            Math.sin(u * Math.PI * (l.freq * 3.4) + t * 1.7 + l.phase) * l.amp * 0.22;
          const envelope = Math.sin(u * Math.PI);
          const y = baseY + wave * envelope * (1 + exp * 0.3);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Occasional bright blue signal
      if (!pulse.active) {
        pulse.next -= 16;
        if (pulse.next <= 0) {
          pulse = {
            line: Math.floor(Math.random() * lines.length),
            x: 0,
            active: true,
            next: 0,
          };
        }
      } else {
        const l = lines[pulse.line];
        if (!l) {
          pulse = { line: 0, x: -1, active: false, next: 1200 };
          if (running) raf = requestAnimationFrame(draw);
          return;
        }
        const baseY = centre + (l.y - 0.5) * height * spread;
        pulse.x += width / 90;
        const segments = 26;
        ctx.lineWidth = 1.4;
        for (let s = 0; s < segments; s++) {
          const x0 = pulse.x - s * (width / 120);
          const x1 = x0 + width / 120;
          if (x1 < 0) break;
          const fade = 1 - s / segments;
          const u0 = Math.max(0, x0) / width;
          const u1 = Math.min(width, x1) / width;
          const t = time * l.speed;
          const yAt = (u: number) =>
            baseY +
            (Math.sin(u * Math.PI * l.freq * 2 + t + l.phase) * l.amp +
              Math.sin(u * Math.PI * (l.freq * 3.4) + t * 1.7 + l.phase) * l.amp * 0.22) *
              Math.sin(u * Math.PI) *
              (1 + exp * 0.3);
          ctx.beginPath();
          ctx.strokeStyle = `rgba(46, 125, 255, ${(fade * 0.85).toFixed(3)})`;
          ctx.moveTo(u0 * width, yAt(u0));
          ctx.lineTo(u1 * width, yAt(u1));
          ctx.stroke();
        }
        if (pulse.x > width * 1.3) {
          pulse = { line: 0, x: -1, active: false, next: 1400 + Math.random() * 2600 };
        }
      }

      if (running) raf = requestAnimationFrame(draw);
    };

    build();

    if (reduced) {
      draw(0);
      cancelAnimationFrame(raf);
      running = false;
    } else if (visible) {
      raf = requestAnimationFrame(draw);
    } else {
      running = false;
      draw(0);
      cancelAnimationFrame(raf);
    }

    const onResize = () => {
      build();
      if (reduced || !visible) draw(0);
    };
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [visible, reduced, density, wrapRef]);

  return (
    <div ref={wrapRef} className={cn("pointer-events-none relative h-full w-full", className)}>
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
    </div>
  );
}

function pseudo(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

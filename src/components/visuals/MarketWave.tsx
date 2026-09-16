import { useEffect, useRef } from "react";
import { usePrefersReducedMotion, useVisible } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

interface MarketWaveProps {
  className?: string;
  /** 0–100 volatility shapes the amplitude; volume drives particle density. */
  volatility?: number;
  volume?: number;
  tone?: "positive" | "negative" | "neutral";
}

/**
 * Living market visualization: a price line whose shape responds to
 * volatility, with particle density standing in for traded volume.
 */
export function MarketWave({
  className,
  volatility = 30,
  volume = 50,
  tone = "neutral",
}: MarketWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { ref: wrapRef, visible } = useVisible<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const params = useRef({ volatility, volume, tone });
  params.current = { volatility, volume, tone };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const colourFor = (alpha: number) => {
      const { tone: t } = params.current;
      if (t === "positive") return `rgba(53, 212, 154, ${alpha})`;
      if (t === "negative") return `rgba(255, 92, 108, ${alpha})`;
      return `rgba(110, 168, 255, ${alpha})`;
    };

    /* ---- deterministic random-walk tick series (real price-action shape) ---- */
    const COUNT = 180;
    let seed = 0x9e3779b9 ^ Math.round(volatility * 977 + volume * 31);
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const prices: number[] = [];
    const vols: number[] = [];
    let last = 100;
    let drift = (params.current.tone === "negative" ? -1 : 1) * 0.012;
    const stepVol = () => 0.18 + (params.current.volatility / 100) * 0.85;
    const tick = () => {
      // fat-tailed shock: mostly small moves, occasional jumps
      const u = rnd();
      const shock = (rnd() - 0.5) * (u > 0.94 ? 4.2 : u > 0.72 ? 1.6 : 0.7);
      if (rnd() > 0.985) drift = -drift * (0.6 + rnd() * 0.8);
      last = last + drift + shock * stepVol();
      prices.push(last);
      vols.push(Math.min(1, 0.12 + Math.abs(shock) * 0.42 + rnd() * 0.3));
      if (prices.length > COUNT) {
        prices.shift();
        vols.shift();
      }
    };
    for (let i = 0; i < COUNT; i++) tick();

    let lastTickAt = 0;
    const TICK_MS = 420;

    const draw = (time: number) => {
      const { volume: vlm } = params.current;
      if (running && time - lastTickAt > TICK_MS) {
        lastTickAt = time;
        tick();
      }
      ctx.clearRect(0, 0, width, height);

      const priceTop = height * 0.06;
      const priceBottom = height * 0.72;
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of prices) {
        if (p < lo) lo = p;
        if (p > hi) hi = p;
      }
      const pad = (hi - lo) * 0.18 || 1;
      lo -= pad;
      hi += pad;
      const yOf = (p: number) => priceBottom - ((p - lo) / (hi - lo)) * (priceBottom - priceTop);
      const xOf = (i: number) => (i / (COUNT - 1)) * width;

      // measurement grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      for (let g = 1; g < 5; g++) {
        const y = priceTop + ((priceBottom - priceTop) / 5) * g;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      const cols = width < 700 ? 6 : 12;
      for (let g = 1; g < cols; g++) {
        const x = (width / cols) * g;
        ctx.beginPath();
        ctx.moveTo(x, priceTop * 0.4);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // area fill under price
      ctx.beginPath();
      ctx.moveTo(0, priceBottom);
      prices.forEach((p, i) => ctx.lineTo(xOf(i), yOf(p)));
      ctx.lineTo(width, priceBottom);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, priceTop, 0, priceBottom);
      grad.addColorStop(0, colourFor(0.26));
      grad.addColorStop(0.6, colourFor(0.06));
      grad.addColorStop(1, "rgba(5, 7, 12, 0)");
      ctx.fillStyle = grad;
      ctx.fill();

      // jagged price line
      ctx.beginPath();
      ctx.lineJoin = "round";
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = colourFor(0.95);
      ctx.shadowColor = colourFor(0.45);
      ctx.shadowBlur = 8;
      prices.forEach((p, i) => {
        const x = xOf(i);
        const y = yOf(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // volume histogram, one bar per tick, up/down coloured
      const baseline = height;
      const barW = Math.max(1, width / COUNT - 1);
      const volMax = height * 0.22 * (0.5 + vlm / 100);
      for (let i = 1; i < prices.length; i++) {
        const h = vols[i]! * volMax;
        const up = prices[i]! >= prices[i - 1]!;
        ctx.fillStyle = up ? colourFor(0.13) : "rgba(255, 92, 108, 0.1)";
        ctx.fillRect(xOf(i) - barW / 2, baseline - h, barW, h);
      }

      // last price: dashed level + pulsing marker at the right edge
      const lastY = yOf(prices[prices.length - 1]!);
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = colourFor(0.3);
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(width, lastY);
      ctx.stroke();
      ctx.setLineDash([]);

      const pulse = 2.4 + Math.sin(time * 0.004) * 1.1;
      ctx.fillStyle = colourFor(0.14);
      ctx.beginPath();
      ctx.arc(width - 1, lastY, pulse * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colourFor(1);
      ctx.beginPath();
      ctx.arc(width - 1, lastY, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // right-edge price ladder
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      for (let g = 0; g <= 5; g++) {
        const y = priceTop + ((priceBottom - priceTop) / 5) * g;
        ctx.beginPath();
        ctx.moveTo(width - 9, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (running) raf = requestAnimationFrame(draw);
    };

    resize();
    if (reduced || !visible) {
      running = false;
      draw(0);
    } else {
      raf = requestAnimationFrame(draw);
    }

    const onResize = () => {
      resize();
      if (reduced || !visible) draw(0);
    };
    window.addEventListener("resize", onResize);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [visible, reduced, wrapRef]);

  return (
    <div ref={wrapRef} className={cn("relative h-full w-full", className)}>
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
    </div>
  );
}

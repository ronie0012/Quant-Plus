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

    const draw = (time: number) => {
      const { volatility: vol, volume: vlm } = params.current;
      ctx.clearRect(0, 0, width, height);
      const amp = (height / 2) * (0.16 + (vol / 100) * 0.6);
      const mid = height * 0.55;
      const t = time * 0.00028;

      const yAt = (u: number) =>
        mid -
        (Math.sin(u * 7.2 + t * 2.1) * amp * 0.55 +
          Math.sin(u * 17.4 + t * 3.4) * amp * 0.24 * (vol / 60) +
          Math.sin(u * 2.3 - t) * amp * 0.4) +
        (u - 0.5) * height * 0.08;

      // measurement grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
      for (let g = 1; g < 5; g++) {
        const y = (height / 5) * g;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      const cols = width < 700 ? 6 : 12;
      for (let g = 1; g < cols; g++) {
        const x = (width / cols) * g;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // area fill
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 4) ctx.lineTo(x, yAt(x / width));
      ctx.lineTo(width, height);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, colourFor(0.3));
      grad.addColorStop(0.55, colourFor(0.08));
      grad.addColorStop(1, "rgba(5, 7, 12, 0)");
      ctx.fillStyle = grad;
      ctx.fill();

      // price line with glow
      ctx.beginPath();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = colourFor(0.95);
      ctx.shadowColor = colourFor(0.5);
      ctx.shadowBlur = 12;
      for (let x = 0; x <= width; x += 3) {
        const y = yAt(x / width);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // volume histogram along the base
      const bars = width < 700 ? 34 : 76;
      for (let i = 0; i < bars; i++) {
        const u = i / bars;
        const h =
          (0.1 + Math.abs(Math.sin(u * 24 + t * 1.6 + i * 0.6)) * (0.22 + (vlm / 100) * 0.5)) *
          (height * 0.3);
        ctx.fillStyle = colourFor(0.1 + (i % 3) * 0.05);
        ctx.fillRect(u * width, height - h, Math.max(1.5, width / bars - 3), h);
      }

      // volume particles
      const count = Math.round((vlm / 100) * (width < 700 ? 40 : 130));
      for (let i = 0; i < count; i++) {
        const u = ((i * 37.13) % 100) / 100;
        const drift = ((time * 0.00004 + i * 0.017) % 1) * 0.4;
        const px = ((u + drift) % 1) * width;
        const spread = ((i * 13.7) % 100) / 100 - 0.5;
        const py = yAt(px / width) + spread * amp * 1.5;
        ctx.fillStyle = colourFor(0.06 + (((i * 7) % 10) / 10) * 0.22);
        ctx.fillRect(px, py, 1.2, 1.2);
      }

      // scanning cursor + live marker
      const scanU = (time * 0.00006) % 1;
      const scanX = scanU * width;
      ctx.strokeStyle = colourFor(0.22);
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, height);
      ctx.stroke();

      const markerY = yAt(scanU);
      const pulse = 3 + Math.sin(time * 0.004) * 1.2;
      ctx.fillStyle = colourFor(0.16);
      ctx.beginPath();
      ctx.arc(scanX, markerY, pulse * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colourFor(1);
      ctx.beginPath();
      ctx.arc(scanX, markerY, 2.6, 0, Math.PI * 2);
      ctx.fill();

      // right-edge price ladder
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      for (let g = 0; g <= 5; g++) {
        const y = (height / 5) * g;
        ctx.beginPath();
        ctx.moveTo(width - 10, y);
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

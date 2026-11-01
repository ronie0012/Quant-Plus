import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabular numeric readout that briefly flashes green/red when the value moves —
 * the way a trading terminal marks a tick.
 */
export function AnimatedNumber({
  value,
  decimals = 2,
  prefix = "",
  suffix = "",
  signed = false,
  locale = "en-US",
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  signed?: boolean;
  locale?: string;
  className?: string;
}) {
  const previous = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value === previous.current) return;
    const dir = value > previous.current ? "up" : "down";
    previous.current = value;
    setFlash(dir);
    const id = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(id);
  }, [value]);

  const body = value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span
      className={cn(
        "num-tabular",
        flash === "up" && "flash-up",
        flash === "down" && "flash-down",
        className,
      )}
    >
      {prefix}
      {signed && value >= 0 ? "+" : ""}
      {body}
      {suffix}
    </span>
  );
}

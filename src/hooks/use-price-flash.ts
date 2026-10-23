import { useEffect, useRef, useState } from "react";

/**
 * Briefly marks a price that just ticked up or down, the way dealing screens do.
 * Returns a class for the `.tick-up` / `.tick-down` animation in styles.css.
 */
export function usePriceFlash(value: number | null | undefined) {
  const previous = useRef(value);
  const [flash, setFlash] = useState<{ cls: "tick-up" | "tick-down"; id: number } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before == null || value == null || before === value) return;
    setFlash({ cls: value > before ? "tick-up" : "tick-down", id: Date.now() });
    const id = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(id);
  }, [value]);
  return flash?.cls ?? "";
}

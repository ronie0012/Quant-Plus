import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Quant Plus mark: a "Q" ring whose tail rises into a plus, on a dark tile.
 * Kept in sync with public/icon.svg (favicon and app icons).
 */
export function BrandMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("h-6 w-6 shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={`${id}-ring`}
          x1="10"
          y1="8"
          x2="50"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8DB8FF" />
          <stop offset="1" stopColor="#2E7DFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#0B1220" />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="14.25"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.08"
        strokeWidth="1.5"
      />
      <circle cx="28" cy="31" r="14" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="6" />
      <path d="M32 35 L46 49" stroke="#35D49A" strokeWidth="6" strokeLinecap="round" />
      <path d="M48 11 v10 M43 16 h10" stroke="#35D49A" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Wordmark used beside the mark: "Quant" with the accent plus. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[15px] font-semibold tracking-tight", className)}>
      Quant<span className="text-positive">+</span>
    </span>
  );
}

import { useMemo } from "react";
import { isFactor, type RippleImpact } from "@/lib/quant/ripple";
import { cn } from "@/lib/utils";

const SIZE = 520;
const CENTER = SIZE / 2;
const RINGS = [0, 92, 165, 232] as const;

type Placed = {
  id: string;
  hop: number;
  x: number;
  y: number;
  impact?: RippleImpact | undefined;
  parent: string | null;
};

/**
 * Radial ripple: the origin in the centre, first-order effects on the inner
 * ring, second and third order further out. Factor nodes passed through on
 * the way (e.g. the rupee) are drawn as neutral waypoints.
 */
export function RippleGraph({
  origin,
  originLabel,
  impacts,
  selected,
  onSelect,
}: {
  origin: string;
  originLabel: string;
  impacts: RippleImpact[];
  selected: string | null;
  onSelect: (symbol: string) => void;
}) {
  const nodes = useMemo(() => {
    const byId = new Map<string, Omit<Placed, "x" | "y">>();
    for (const impact of impacts) {
      impact.path.forEach((id, hop) => {
        if (hop === 0 || byId.has(id)) return;
        byId.set(id, {
          id,
          hop,
          parent: impact.path[hop - 1] ?? null,
          impact: id === impact.symbol ? impact : undefined,
        });
      });
    }
    const placed = new Map<string, Placed>();
    placed.set(origin, { id: origin, hop: 0, x: CENTER, y: CENTER, parent: null });
    for (const hop of [1, 2, 3]) {
      const ring = [...byId.values()].filter((node) => node.hop === hop);
      // Keep children near their parent's angle so lines stay short.
      const angleOf = (id: string | null) => {
        const p = id ? placed.get(id) : undefined;
        return p && p.hop > 0 ? Math.atan2(p.y - CENTER, p.x - CENTER) : -Math.PI / 2;
      };
      ring.sort((a, b) => angleOf(a.parent) - angleOf(b.parent) || a.id.localeCompare(b.id));
      const offset =
        hop === 1 ? -Math.PI / 2 : angleOf(ring[0]?.parent ?? null) - Math.PI / ring.length;
      ring.forEach((node, i) => {
        const angle = offset + (i / ring.length) * Math.PI * 2;
        placed.set(node.id, {
          ...node,
          x: CENTER + RINGS[hop]! * Math.cos(angle),
          y: CENTER + RINGS[hop]! * Math.sin(angle),
        });
      });
    }
    return [...placed.values()];
  }, [impacts, origin]);

  const position = new Map(nodes.map((node) => [node.id, node]));
  const maxHop = Math.max(1, ...nodes.map((node) => node.hop));
  const highlighted = new Set(impacts.find((i) => i.symbol === selected)?.path ?? []);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="mx-auto block h-auto w-full max-w-[520px]"
      role="img"
      aria-label={`Ripple from ${originLabel}: ${impacts.length} connected companies`}
    >
      {RINGS.slice(1, maxHop + 1).map((r) => (
        <circle
          key={r}
          cx={CENTER}
          cy={CENTER}
          r={r}
          fill="none"
          strokeDasharray="2 5"
          className="stroke-border"
        />
      ))}
      {nodes
        .filter((node) => node.parent)
        .map((node) => {
          const from = position.get(node.parent!);
          if (!from) return null;
          const on = highlighted.has(node.id) && highlighted.has(node.parent!);
          return (
            <line
              key={`${node.parent}-${node.id}`}
              x1={from.x}
              y1={from.y}
              x2={node.x}
              y2={node.y}
              strokeWidth={on ? 2 : 1}
              className={cn(on ? "stroke-primary" : "stroke-border-strong", "transition-all")}
            />
          );
        })}
      {nodes.map((node) => {
        if (node.hop === 0)
          return (
            <g key={node.id}>
              <circle cx={node.x} cy={node.y} r={30} className="fill-primary/15 stroke-primary" />
              <circle
                cx={node.x}
                cy={node.y}
                r={42}
                fill="none"
                className="ripple-pulse stroke-primary/40"
              />
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-semibold"
              >
                {node.id.length > 9 ? `${node.id.slice(0, 8)}…` : node.id}
              </text>
            </g>
          );
        const impact = node.impact;
        const waypoint = !impact || isFactor(node.id);
        const r = waypoint ? 6 : 7 + impact.strength * 9;
        const active = selected === node.id;
        return (
          <g
            key={node.id}
            role={waypoint ? undefined : "button"}
            tabIndex={waypoint ? undefined : 0}
            aria-label={
              waypoint
                ? undefined
                : `${node.id}, ${impact.direction === "UP" ? "may rise" : "may fall"}`
            }
            onClick={waypoint ? undefined : () => onSelect(node.id)}
            onKeyDown={
              waypoint
                ? undefined
                : (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(node.id);
                    }
                  }
            }
            className={cn(!waypoint && "cursor-pointer focus:outline-none")}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={r}
              strokeWidth={active ? 2.5 : 1}
              className={cn(
                waypoint
                  ? "fill-panel stroke-border-strong"
                  : impact.direction === "UP"
                    ? "fill-positive/25 stroke-positive"
                    : "fill-negative/25 stroke-negative",
                active && "stroke-foreground",
              )}
            />
            <text
              x={node.x}
              y={node.y + r + 12}
              textAnchor="middle"
              className={cn(
                "text-[10px]",
                waypoint
                  ? "fill-subtle italic"
                  : active
                    ? "fill-foreground font-semibold"
                    : "fill-muted-foreground",
              )}
            >
              {node.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

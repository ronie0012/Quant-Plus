import { toast } from "sonner";
import { Card, CardHead } from "@/components/app/cards";
import { Switch } from "@/components/ui/switch";
import { MODE_LABELS, useWorkspacePrefs } from "@/hooks/use-workspace-prefs";
import type { WorkspaceMode } from "@/hooks/use-trading-product";

/** Workspace behaviour settings; each control saves immediately. */
export function WorkspaceSettings() {
  const { workspace, save } = useWorkspacePrefs();
  const update = (patch: Parameters<typeof save.mutate>[0]) =>
    save.mutate(patch, { onError: () => toast.error("Setting could not be saved") });

  async function togglePush(on: boolean) {
    if (!on) return update({ push_notifications: false });
    if (typeof Notification === "undefined") {
      toast.error("This browser does not support notifications.");
      return;
    }
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") {
      toast.error("Notifications are blocked for this site in the browser settings.");
      return;
    }
    update({ push_notifications: true });
  }

  const switches: {
    key: "focus_mode" | "review_mode" | "low_bandwidth";
    label: string;
    hint: string;
  }[] = [
    {
      key: "focus_mode",
      label: "Focus mode",
      hint: "Hides the AI dock, the scrolling tape and entrance animations while you decide. Shortcut: F.",
    },
    {
      key: "review_mode",
      label: "Review mode",
      hint: "Blocks new entries until a complete decision plan is linked. Exits are never blocked. Shortcut: V.",
    },
    {
      key: "low_bandwidth",
      label: "Low-bandwidth mode",
      hint: "Turns off animation, blur and ambient effects, and stops refetching when the window regains focus or reconnects.",
    },
  ];
  return (
    <Card>
      <CardHead title="Workspace" meta="Saved immediately" />
      <div className="space-y-5 p-5">
        <label className="block text-[13px]">
          Layout mode
          <select
            value={workspace.mode}
            onChange={(e) => update({ mode: e.target.value as WorkspaceMode })}
            className="mt-2 block h-10 w-full border border-border bg-background px-2 text-sm"
          >
            {(Object.keys(MODE_LABELS) as WorkspaceMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-subtle">
            Custom panels and order are edited from the dashboard's Layout button.
          </span>
        </label>
        {switches.map((s) => (
          <label key={s.key} className="flex items-start justify-between gap-4 text-[13px]">
            <span>
              {s.label}
              <span className="mt-0.5 block text-[11px] text-subtle">{s.hint}</span>
            </span>
            <Switch
              checked={workspace[s.key]}
              onCheckedChange={(v) => update({ [s.key]: v })}
              aria-label={s.label}
            />
          </label>
        ))}
        <label className="flex items-start justify-between gap-4 text-[13px]">
          <span>
            System notifications
            <span className="mt-0.5 block text-[11px] text-subtle">
              Shows order and alert notifications from this device while the terminal is open in the
              background. Server push to a closed app needs hosted deployment.
            </span>
          </span>
          <Switch
            checked={workspace.push_notifications}
            onCheckedChange={(v) => void togglePush(v)}
            aria-label="System notifications"
          />
        </label>
        <label className="block text-[13px]">
          Attention budget (interruptions per hour)
          <input
            type="number"
            min={0}
            max={1000}
            value={workspace.attention_budget_per_hour}
            onChange={(e) =>
              update({
                attention_budget_per_hour: Math.min(
                  1000,
                  Math.max(0, Math.floor(Number(e.target.value)) || 0),
                ),
              })
            }
            className="mt-2 block h-10 w-full border border-border bg-background px-2 font-mono text-sm"
          />
          <span className="mt-1 block text-[11px] text-subtle">
            Beyond this, notifications are held and summarised. Rejected or failed orders always
            interrupt. 0 means no limit.
          </span>
        </label>
        <label className="block text-[13px]">
          Sector concentration policy (% of equity)
          <input
            type="number"
            min={1}
            max={100}
            value={workspace.max_sector_pct}
            onChange={(e) =>
              update({
                max_sector_pct: Math.min(100, Math.max(1, Math.floor(Number(e.target.value)) || 1)),
              })
            }
            className="mt-2 block h-10 w-full border border-border bg-background px-2 font-mono text-sm"
          />
          <span className="mt-1 block text-[11px] text-subtle">
            The pre-trade risk compiler warns when a buy would take one sector above this share.
          </span>
        </label>
      </div>
    </Card>
  );
}

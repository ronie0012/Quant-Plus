import { useEffect, useMemo, useState } from "react";
import {
  getWorkspaceSession,
  WORKSPACE_SESSION_CHANGED,
  type WorkspaceSession,
} from "@/lib/workspace-session";
import { useTradingPreferences } from "./use-trading-product";

/** Local workspace profile for client-rendered app shells. */
export function useSession() {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: preferences } = useTradingPreferences(session?.mode === "local");

  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = () => {
      const current = ++sequence;
      void getWorkspaceSession()
        .then((next) => {
          if (!active || current !== sequence) return;
          setSession(next);
          setLoading(false);
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    };
    refresh();
    window.addEventListener(WORKSPACE_SESSION_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.removeEventListener(WORKSPACE_SESSION_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

  const name = preferences?.display_name?.trim();
  const profileSession = useMemo(
    () =>
      session?.mode === "local" && name
        ? { ...session, user: { ...session.user, user_metadata: { display_name: name } } }
        : session,
    [session, name],
  );
  return { session: profileSession, loading };
}

export function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function displayNameFrom(session: WorkspaceSession | null) {
  const meta = session?.user?.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.["display_name"] === "string" && (meta["display_name"] as string)) ||
    (typeof meta?.["full_name"] === "string" && (meta["full_name"] as string)) ||
    session?.user?.email?.split("@")[0] ||
    "Investor";
  return name.trim().split(/\s+/)[0] || "Investor";
}

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Live Supabase session for client-rendered app shells. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function displayNameFrom(session: Session | null) {
  const meta = session?.user?.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.["display_name"] === "string" && (meta["display_name"] as string)) ||
    (typeof meta?.["full_name"] === "string" && (meta["full_name"] as string)) ||
    session?.user?.email?.split("@")[0] ||
    "Investor";
  return name.split(" ")[0] ?? name;
}

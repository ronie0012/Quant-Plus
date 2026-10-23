/**
 * Optional product analytics and error reporting through PostHog.
 *
 * Off unless VITE_POSTHOG_KEY is set (get it with `npx -y @insforge/cli posthog setup`).
 * Privacy defaults: no session recording, inputs never captured, Do Not Track
 * respected, users identified by opaque id only (never email or name).
 */
type PostHog = typeof import("posthog-js").default;

let client: Promise<PostHog | null> | null = null;

function load() {
  const key = import.meta.env["VITE_POSTHOG_KEY"] as string | undefined;
  if (!key || typeof window === "undefined") return Promise.resolve(null);
  client ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host:
          (import.meta.env["VITE_POSTHOG_HOST"] as string | undefined) ??
          "https://us.i.posthog.com",
        capture_pageview: "history_change",
        capture_pageleave: true,
        autocapture: { dom_event_allowlist: ["click", "submit"] },
        mask_all_text: false,
        mask_all_element_attributes: true,
        disable_session_recording: true,
        respect_dnt: true,
        person_profiles: "identified_only",
        persistence: "localStorage+cookie",
      });
      return posthog;
    })
    .catch(() => null);
  return client;
}

/** Starts analytics and global error capture once per page load. */
export function startTelemetry() {
  void load().then((posthog) => {
    if (!posthog) return;
    window.addEventListener("error", (event) => {
      posthog.captureException(event.error ?? new Error(event.message), {
        source: "window.error",
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      posthog.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
        source: "unhandledrejection",
      });
    });
  });
}

export function identifyUser(id: string | null, mode: "local" | "hosted" | null) {
  void load().then((posthog) => {
    if (!posthog) return;
    if (id) posthog.identify(id, { workspace_mode: mode });
    else posthog.reset();
  });
}

/** Records a product event; property values must never contain personal data. */
export function track(event: string, properties?: Record<string, string | number | boolean>) {
  void load().then((posthog) => posthog?.capture(event, properties));
}

export function reportError(error: unknown, context?: Record<string, string>) {
  void load().then((posthog) =>
    posthog?.captureException(error instanceof Error ? error : new Error(String(error)), context),
  );
}

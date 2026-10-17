import { LOCAL_TOKEN, LOCAL_USER_ID } from "./local-session";

/**
 * App-owned session contract. The single local profile is a loopback boundary
 * marker, not multi-user authentication. Hosted InsForge sessions satisfy the
 * same contract when VITE_QUANT_PLUS_AUTH=insforge (not enabled by default).
 */
export type WorkspaceSession = {
  access_token: string;
  mode: "local" | "hosted";
  user: {
    id: string;
    email: string;
    user_metadata: { display_name: string };
  };
};

export const LOCAL_WORKSPACE_SESSION: WorkspaceSession = {
  access_token: LOCAL_TOKEN,
  mode: "local",
  user: {
    id: LOCAL_USER_ID,
    email: "local@quant-plus.local",
    user_metadata: { display_name: "Investor" },
  },
};

const HOSTED_KEY = "qp-hosted-session";
export const WORKSPACE_SESSION_CHANGED = "qp-session-changed";
let sessionRequest: Promise<WorkspaceSession | null> | null = null;
let authGeneration = 0;

function clearSessionCache() {
  authGeneration++;
  sessionRequest = null;
  sessionStorage.removeItem(HOSTED_KEY);
}

function announceSessionChange() {
  window.dispatchEvent(new Event(WORKSPACE_SESSION_CHANGED));
  try {
    localStorage.setItem(WORKSPACE_SESSION_CHANGED, String(Date.now()) + Math.random());
  } catch {
    /* storage may be disabled */
  }
}

export function forgetWorkspaceSession() {
  clearSessionCache();
  if (typeof window !== "undefined") announceSessionChange();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key !== WORKSPACE_SESSION_CHANGED) return;
    clearSessionCache();
    window.dispatchEvent(new Event(WORKSPACE_SESSION_CHANGED));
  });
}

type HostedConfig = { url: string; anonKey: string };

/** Whether this frontend was explicitly built for InsForge authentication. */
export function hostedAuthEnabled() {
  const env = import.meta.env as Record<string, string | undefined>;
  return env["VITE_QUANT_PLUS_AUTH"] === "insforge";
}

export function hostedAuthConfig(): HostedConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  if (!hostedAuthEnabled()) return null;
  const url = env["VITE_INSFORGE_URL"];
  const anonKey = env["VITE_INSFORGE_ANON_KEY"];
  return url && anonKey ? { url, anonKey } : null;
}

function tokenExpired(token: string) {
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as {
      exp?: number;
    };
    return (
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp) ||
      payload.exp * 1000 <= Date.now() + 30_000
    );
  } catch {
    return true;
  }
}

function readHostedSession(): WorkspaceSession | null {
  try {
    const stored = JSON.parse(
      sessionStorage.getItem(HOSTED_KEY) ?? "null",
    ) as WorkspaceSession | null;
    if (!stored || stored.mode !== "hosted" || tokenExpired(stored.access_token)) return null;
    return stored;
  } catch {
    return null;
  }
}

export async function getWorkspaceSession(): Promise<WorkspaceSession | null> {
  if (!hostedAuthEnabled()) return LOCAL_WORKSPACE_SESSION;
  if (!hostedAuthConfig())
    throw new Error("Hosted authentication is misconfigured; contact the workspace administrator.");
  if (typeof window === "undefined") return null;
  const cached = readHostedSession();
  if (cached) return cached;
  if (!sessionRequest) {
    const generation = authGeneration;
    const pending = (async () => {
      let response = await fetch("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (generation !== authGeneration) return null;
      const nearExpiry =
        response.ok &&
        tokenExpired(
          ((await response.clone().json()) as { session?: WorkspaceSession }).session
            ?.access_token ?? "",
        );
      if (response.status === 401 || nearExpiry) {
        const refreshed = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (generation !== authGeneration) return null;
        if (refreshed.status === 401 || refreshed.status === 403) {
          sessionStorage.removeItem(HOSTED_KEY);
          return null;
        }
        if (!refreshed.ok) throw new Error("Session refresh is temporarily unavailable");
        response = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
      }
      if (generation !== authGeneration) return null;
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Authentication service unavailable");
      const { session } = (await response.json()) as { session: WorkspaceSession | null };
      if (generation !== authGeneration) return null;
      if (!session || session.mode !== "hosted" || tokenExpired(session.access_token)) return null;
      sessionStorage.setItem(HOSTED_KEY, JSON.stringify(session));
      return session;
    })();
    const tracked: Promise<WorkspaceSession | null> = pending.finally(() => {
      if (sessionRequest === tracked) sessionRequest = null;
    });
    sessionRequest = tracked;
  }
  return sessionRequest;
}

/** Authorization header for same-origin API calls; throws when signed out. */
export async function workspaceAuthorization(message = "Sign in to continue") {
  const session = await getWorkspaceSession();
  if (!session) throw new Error(message);
  return `Bearer ${session.access_token}`;
}

/** Refresh once after a server-side 401, then let the caller retry its request. */
export async function refreshWorkspaceSession() {
  if (!hostedAuthEnabled()) return null;
  clearSessionCache();
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    });
    if (response.status === 401 || response.status === 403) {
      forgetWorkspaceSession();
      return null;
    }
    if (!response.ok) throw new Error("Authentication service unavailable");
    const session = await getWorkspaceSession();
    if (!session) forgetWorkspaceSession();
    return session;
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication service unavailable")
      throw error;
    return null;
  }
}

/** Same-origin authenticated fetch with one refresh-and-retry on a 401. */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  options: RequestInit = {},
  message = "Sign in to continue",
) {
  async function send() {
    const headers = new Headers(options.headers);
    headers.set("Authorization", await workspaceAuthorization(message));
    return fetch(input, { ...options, headers });
  }
  let response = await send();
  if (response.status !== 401 || !hostedAuthEnabled()) return response;
  if (!(await refreshWorkspaceSession())) return response;
  response = await send();
  if (response.status === 401) forgetWorkspaceSession();
  return response;
}

async function authAction(action: string, body?: Record<string, string>) {
  if (!hostedAuthEnabled()) throw new Error("Hosted sign-in is not enabled in this build.");
  if (!hostedAuthConfig())
    throw new Error("Hosted authentication is misconfigured; contact the workspace administrator.");
  // A previous refresh response must finish setting its cookies before an
  // account switch can establish a different owner's cookies.
  await sessionRequest?.catch(() => null);
  const response = await fetch(`/api/auth/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json()) as {
    error?: string;
    requireEmailVerification?: boolean;
    verifyEmailMethod?: "code" | "link";
  };
  if (!response.ok) throw new Error(data.error || "Authentication failed");
  clearSessionCache();
  return data;
}

async function signedInSession() {
  const session = await getWorkspaceSession();
  if (!session) throw new Error("Sign-in did not return a session.");
  announceSessionChange();
  return session;
}

export async function signInHosted(email: string, password: string) {
  await authAction("sign-in", { email, password });
  return signedInSession();
}

export async function signUpHosted(email: string, password: string, name: string) {
  const data = await signUpHostedResult(email, password, name);
  return data?.session ?? null;
}

export async function signUpHostedResult(
  email: string,
  password: string,
  name: string,
): Promise<{ session: WorkspaceSession | null; verifyEmailMethod?: "code" | "link" }> {
  const data = await authAction("sign-up", { email, password, name });
  if (data.requireEmailVerification)
    return { session: null, verifyEmailMethod: data.verifyEmailMethod ?? "code" };
  return {
    session: await signedInSession(),
  };
}

export async function signOutWorkspace() {
  if (!hostedAuthConfig()) return;
  await authAction("sign-out");
  announceSessionChange();
}

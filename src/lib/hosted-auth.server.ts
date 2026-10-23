import {
  createAuthActions,
  createServerClient,
  DEFAULT_ACCESS_TOKEN_COOKIE,
  DEFAULT_REFRESH_TOKEN_COOKIE,
  refreshAuth,
  type CookieOptions,
  type CookieStore,
} from "@insforge/sdk/ssr";
import { createHash } from "node:crypto";

const refreshes = new Map<string, { expires: number; result: Promise<Response> }>();
async function refreshResponse(
  options: Parameters<typeof refreshAuth>[0],
  token: string,
  baseUrl: string,
) {
  if (!token) return (await refreshAuth(options)).response;
  const now = Date.now();
  for (const [key, entry] of refreshes) if (entry.expires < now) refreshes.delete(key);
  const key = createHash("sha256").update(`${baseUrl}\0${token}`).digest("hex");
  let entry = refreshes.get(key);
  if (!entry) {
    if (refreshes.size >= 128)
      return Response.json({ error: "Authentication is busy" }, { status: 503 });
    const result = refreshAuth(options).then(({ response }) => {
      response.headers.set("Cache-Control", "no-store");
      const current = refreshes.get(key);
      if (current) current.expires = Date.now() + 5000;
      return response;
    });
    entry = { expires: now + 15_000, result };
    refreshes.set(key, entry);
  }
  return (await entry.result).clone();
}

/** Adapt the SDK's SSR cookie contract to standard Request/Response objects. */
export function authCookies(request: Request, headers: Headers): CookieStore {
  const values = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    try {
      values.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1)));
    } catch {
      // Ignore a malformed cookie instead of failing all authentication.
    }
  }
  const set = (name: string, value: string, options: CookieOptions = {}) => {
    values.set(name, value);
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
    if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
    headers.append("Set-Cookie", parts.join("; "));
  };
  return {
    get: (name) => values.get(name),
    set: (...args) => {
      if (typeof args[0] === "string") set(args[0], args[1]!, args[2]);
      else {
        const { name, value, ...options } = args[0];
        set(name, value, options);
      }
    },
    delete: (name) => set(name, "", { maxAge: 0, httpOnly: true, sameSite: "lax" }),
  };
}

export async function hostedAuth(request: Request) {
  const baseUrl = process.env["INSFORGE_URL"];
  const anonKey = process.env["INSFORGE_ANON_KEY"];
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json" });
  const reply = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers });
  if (!baseUrl || !anonKey) return reply({ error: "Hosted sign-in is not configured" }, 503);
  const url = new URL(request.url);
  const action = url.pathname.split("/").pop();
  if (request.method === "GET" && !["session", "book-check"].includes(action ?? ""))
    return reply({ error: "Method not allowed" }, 405);
  if (request.method !== "GET") {
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    if (request.headers.get("origin") !== url.origin)
      return reply({ error: "Authentication requires a same-origin request" }, 403);
  }
  const cookies = authCookies(request, headers);
  const options = {
    baseUrl,
    anonKey,
    fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      globalThis.fetch(input, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(10_000),
        ]),
      }),
    options: {
      accessToken: { secure: url.protocol === "https:", sameSite: "lax" as const },
      refreshToken: { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax" as const },
    },
  };
  try {
    if (action === "book-check") {
      if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405);
      const token = cookies.get(DEFAULT_ACCESS_TOKEN_COOKIE);
      if (typeof token !== "string" || !token)
        return reply({ error: "Sign in to connect first" }, 401);
      const { checkHostedPortfolio } = await import("./hosted-book-check.server");
      const { HostedBookError } = await import("./insforge-book.server");
      try {
        return reply(await checkHostedPortfolio(baseUrl.replace(/\/$/, ""), token));
      } catch (error) {
        if (error instanceof HostedBookError) return reply({ error: error.message }, error.status);
        throw error;
      }
    }
    if (action === "refresh") {
      // The SDK owns the refresh cookie and rotation; never expose refresh tokens in JSON.
      return refreshResponse(
        { ...options, cookies },
        String(cookies.get(DEFAULT_REFRESH_TOKEN_COOKIE) ?? ""),
        baseUrl,
      );
    }
    if (action === "session") {
      const token = cookies.get(DEFAULT_ACCESS_TOKEN_COOKIE);
      if (typeof token !== "string" || !token) return reply({ session: null }, 401);
      const { data, error } = await createServerClient({
        ...options,
        cookies,
      }).auth.getCurrentUser();
      if (error || !data.user)
        return reply({ session: null }, error?.statusCode === 401 ? 401 : 503);
      return reply({
        session: {
          mode: "hosted",
          access_token: token,
          user: {
            id: data.user.id,
            email: data.user.email,
            user_metadata: {
              display_name: data.user.profile?.name || data.user.email.split("@")[0],
            },
          },
        },
      });
    }
    const auth = createAuthActions({ ...options, cookies });
    if (action === "sign-out") {
      const { error } = await auth.signOut();
      return reply(
        error ? { error: "Could not complete sign-out" } : { ok: true },
        error ? 503 : 200,
      );
    }
    if (
      ![
        "sign-in",
        "sign-up",
        "verify-email",
        "resend-verification",
        "send-reset-password",
        "exchange-reset-password",
        "reset-password",
      ].includes(action ?? "")
    )
      return reply({ error: "Unknown authentication action" }, 404);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return reply({ error: "Invalid sign-in details" }, 400);
    const input = body as Record<string, unknown>;
    const email = input["email"];
    const password = input["password"];
    const name = input["name"];
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      return reply({ error: "Enter a valid account email" }, 400);
    if (action === "verify-email") {
      const otp = input["otp"];
      if (typeof otp !== "string" || !/^\d{6}$/.test(otp))
        return reply({ error: "Enter the six-digit verification code" }, 400);
      const { data, error } = await auth.verifyEmail({ email, otp });
      if (error) return reply({ error: error.message }, error.statusCode === 429 ? 429 : 400);
      return reply({ verified: true, user: data?.user ?? null });
    }
    if (action === "resend-verification") {
      const { error } = await createServerClient({
        ...options,
        cookies,
      }).auth.resendVerificationEmail({ email, redirectTo: `${url.origin}/auth` });
      if (error) return reply({ error: error.message }, error.statusCode === 429 ? 429 : 400);
      return reply({ ok: true });
    }
    if (action === "send-reset-password") {
      const { error } = await createServerClient({
        ...options,
        cookies,
      }).auth.sendResetPasswordEmail({
        email,
        redirectTo: `${url.origin}/auth`,
      });
      if (error) return reply({ error: error.message }, error.statusCode === 429 ? 429 : 400);
      return reply({ ok: true });
    }
    if (action === "exchange-reset-password") {
      const otp = input["otp"];
      if (typeof otp !== "string" || !/^\d{6}$/.test(otp))
        return reply({ error: "Enter the six-digit reset code" }, 400);
      const { data, error } = await createServerClient({
        ...options,
        cookies,
      }).auth.exchangeResetPasswordToken({
        email,
        code: otp,
      });
      if (error) return reply({ error: error.message }, error.statusCode === 429 ? 429 : 400);
      return reply({ token: data?.token });
    }
    if (action === "reset-password") {
      const otp = input["otp"];
      if (typeof otp !== "string" || !otp || typeof password !== "string" || password.length < 8)
        return reply(
          { error: "Enter a valid reset code and a password of at least 8 characters" },
          400,
        );
      const { error } = await createServerClient({ ...options, cookies }).auth.resetPassword({
        newPassword: password,
        otp,
      });
      if (error) return reply({ error: error.message }, error.statusCode === 429 ? 429 : 400);
      return reply({ ok: true });
    }
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" ||
      !password ||
      password.length > 1024 ||
      (action === "sign-up" && (typeof name !== "string" || !name.trim() || name.length > 100))
    )
      return reply({ error: "Invalid sign-in details" }, 400);
    const { data, error } =
      action === "sign-in"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({
            email,
            password,
            name: (name as string).trim(),
            redirectTo: `${url.origin}/auth`,
          });
    if (error)
      return reply(
        { error: error.message },
        error.statusCode === 401 || error.statusCode === 403 ? error.statusCode : 400,
      );
    return reply({
      user: data?.user ?? null,
      requireEmailVerification:
        "requireEmailVerification" in (data ?? {}) &&
        (data as { requireEmailVerification?: boolean }).requireEmailVerification,
      verifyEmailMethod: (data as { verifyEmailMethod?: "code" | "link" } | null)
        ?.verifyEmailMethod,
    });
  } catch {
    return reply({ error: "Authentication service unavailable" }, 503);
  }
}

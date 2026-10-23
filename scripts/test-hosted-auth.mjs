import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as crypto from "node:crypto";

const prior = { ...process.env };
process.env.INSFORGE_URL = "https://auth.example";
process.env.INSFORGE_ANON_KEY = "public-anon";
let calls = 0;
let options;
let refreshCalls = 0;
const user = { id: "test-user", email: "owner@example.com", profile: { name: "Owner" } };
const sdk = {
  DEFAULT_ACCESS_TOKEN_COOKIE: "insforge_access_token",
  DEFAULT_REFRESH_TOKEN_COOKIE: "insforge_refresh_token",
  createAuthActions(config) {
    options = config;
    calls++;
    return {
      async signInWithPassword() {
        config.cookies.set("insforge_access_token", "short-lived", {
          sameSite: "lax",
          secure: true,
        });
        config.cookies.set({
          name: "insforge_refresh_token",
          value: "private-refresh",
          httpOnly: true,
          sameSite: "lax",
          secure: true,
        });
        return { data: { user }, error: null };
      },
      async signUp() {
        return { data: { requireEmailVerification: true, verifyEmailMethod: "code" }, error: null };
      },
      async verifyEmail(input) {
        assert.equal(input.email, user.email);
        assert.equal(input.otp, "000123");
        return { data: { user: { ...user, emailVerified: true } }, error: null };
      },
      async signOut() {
        config.cookies.delete("insforge_access_token");
        config.cookies.delete("insforge_refresh_token");
        return { error: null };
      },
    };
  },
  createServerClient(config) {
    assert.equal(config.cookies.get("insforge_access_token"), "short-lived");
    return {
      auth: {
        async getCurrentUser() {
          return { data: { user }, error: null };
        },
        async resendVerificationEmail(input) {
          assert.equal(input.email, user.email);
          return { data: { success: true }, error: null };
        },
        async sendResetPasswordEmail(input) {
          assert.equal(input.email, user.email);
          return { data: { success: true }, error: null };
        },
        async exchangeResetPasswordToken(input) {
          assert.equal(input.email, user.email);
          assert.equal(input.code, "000123");
          return { data: { token: "reset-token" }, error: null };
        },
        async resetPassword(input) {
          assert.equal(input.otp, "reset-token");
          assert.equal(input.newPassword, "new-password");
          return { data: { success: true }, error: null };
        },
      },
    };
  },
  async refreshAuth(config) {
    refreshCalls++;
    assert.equal(config.cookies.get("insforge_refresh_token"), "private-refresh");
    return {
      response: new Response("{}", {
        headers: {
          "Set-Cookie": "insforge_refresh_token=rotated; HttpOnly; SameSite=lax",
          "Cache-Control": "no-store",
        },
      }),
    };
  },
};
const module = {};
new Function(
  "exports",
  "require",
  ts.transpileModule(readFileSync("src/lib/hosted-auth.server.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
)(module, (name) => {
  if (name === "node:crypto") return crypto;
  assert.equal(name, "@insforge/sdk/ssr");
  return sdk;
});
const request = (action, body, origin = "https://local.example") =>
  new Request(`https://local.example/api/auth/${action}`, {
    method: action === "session" ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "insforge_access_token=short-lived; insforge_refresh_token=private-refresh",
    },
    ...(action === "session" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
try {
  const denied = await module.hostedAuth(request("sign-in", {}, "https://hostile.example"));
  assert.equal(denied.status, 403);
  assert.equal(calls, 0);
  const invalid = await module.hostedAuth(request("sign-in", { email: "bad", password: "x" }));
  assert.equal(invalid.status, 400);
  const login = await module.hostedAuth(
    request("sign-in", { email: user.email, password: "password" }),
  );
  assert.equal(login.status, 200);
  assert.doesNotMatch(await login.text(), /short-lived|private-refresh|password/);
  assert.match(
    login.headers.get("set-cookie"),
    /insforge_refresh_token=private-refresh; Path=\/; HttpOnly; Secure; SameSite=lax/,
  );
  assert.equal(options.options.refreshToken.httpOnly, true);
  const session = await module.hostedAuth(request("session"));
  assert.equal((await session.json()).session.user.user_metadata.display_name, "Owner");
  assert.equal(session.headers.get("cache-control"), "no-store");
  const refresh = await module.hostedAuth(request("refresh"));
  assert.match(refresh.headers.get("set-cookie"), /rotated; HttpOnly/);
  const parallel = await Promise.all([
    module.hostedAuth(request("refresh")),
    module.hostedAuth(request("refresh")),
  ]);
  assert.ok(parallel.every((response) => response.status === 200));
  assert.equal(refreshCalls, 1, "concurrent tabs coalesce rotation in the single local server");
  const registration = await module.hostedAuth(
    request("sign-up", { email: user.email, password: "password", name: "Owner" }),
  );
  assert.equal((await registration.json()).requireEmailVerification, true);
  assert.equal(
    (await module.hostedAuth(request("verify-email", { email: user.email, otp: "123" }))).status,
    400,
  );
  assert.equal(
    (await module.hostedAuth(request("verify-email", { email: user.email, otp: "000123" }))).status,
    200,
  );
  assert.equal(
    (await module.hostedAuth(request("resend-verification", { email: user.email }))).status,
    200,
  );
  assert.equal(
    (await module.hostedAuth(request("send-reset-password", { email: user.email }))).status,
    200,
  );
  assert.equal(
    (
      await module.hostedAuth(
        request("exchange-reset-password", { email: user.email, otp: "000123" }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await module.hostedAuth(
        request("reset-password", {
          email: user.email,
          otp: "reset-token",
          password: "new-password",
        }),
      )
    ).status,
    200,
  );
  const logout = await module.hostedAuth(request("sign-out"));
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (await module.hostedAuth(new Request("https://local.example/api/auth/session"))).status,
    401,
  );
  assert.equal(
    (await module.hostedAuth(new Request("https://local.example/api/auth/book-check"))).status,
    401,
  );
  assert.equal((await module.hostedAuth(request("book-check"))).status, 405);
  delete process.env.INSFORGE_ANON_KEY;
  assert.equal((await module.hostedAuth(request("session"))).status, 503);
  console.log(
    "Hosted auth checks passed: same-origin enforcement, validation, safe responses, HttpOnly refresh cookies, rotation, session identity, sign-out and configuration failures.",
  );
} finally {
  for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key];
  Object.assign(process.env, prior);
}

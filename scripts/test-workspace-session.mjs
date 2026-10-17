import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { localTestModule } from "./local-test-module.mjs";

const previous = {
  window: globalThis.window,
  sessionStorage: globalThis.sessionStorage,
  localStorage: globalThis.localStorage,
  fetch: globalThis.fetch,
  now: Date.now,
};
class Storage {
  data = new Map();
  getItem(key) {
    return this.data.get(key) ?? null;
  }
  setItem(key, value) {
    this.data.set(key, String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
}
globalThis.window = new EventTarget();
globalThis.sessionStorage = new Storage();
globalThis.localStorage = new Storage();
let now = Date.parse("2026-10-15T05:00:00Z");
Date.now = () => now;
const token = (seconds) =>
  `header.${Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + seconds })).toString("base64url")}.signature`;
const session = (name, seconds = 120) => ({
  mode: "hosted",
  access_token: token(seconds),
  user: { id: name, email: `${name}@example.com`, user_metadata: { display_name: name } },
});
let current = session("Owner");
let sessions = 0;
let refreshes = 0;
let protectedCalls = 0;
globalThis.fetch = async (path, options = {}) => {
  if (path === "/api/auth/session") {
    sessions++;
    return current ? Response.json({ session: current }) : new Response("{}", { status: 401 });
  }
  if (path === "/api/auth/refresh") {
    refreshes++;
    if (!current) return new Response("{}", { status: 401 });
    current = session(current.user.id);
    return Response.json({ ok: true });
  }
  if (path === "/api/auth/sign-in") {
    current = session(JSON.parse(options.body).email.split("@")[0]);
    return Response.json({ user: current.user });
  }
  if (path === "/api/auth/sign-up") return Response.json({ requireEmailVerification: true });
  if (path === "/api/auth/sign-out") {
    current = null;
    return Response.json({ ok: true });
  }
  if (path === "/api/local") {
    protectedCalls++;
    return protectedCalls === 1
      ? new Response("expired", { status: 401 })
      : Response.json({ ok: true });
  }
  throw new Error(`Unexpected request ${path}`);
};
const config = {
  VITE_QUANT_PLUS_AUTH: "insforge",
  VITE_INSFORGE_URL: "https://auth.example",
  VITE_INSFORGE_ANON_KEY: "public",
};
const code = ts.transpileModule(
  readFileSync("src/lib/workspace-session.ts", "utf8").replaceAll(
    "import.meta.env",
    JSON.stringify(config),
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const module = {};
new Function("exports", "require", code)(module, (name) => {
  assert.equal(name, "./local-session");
  return localTestModule("@/lib/local-session");
});
try {
  const concurrent = await Promise.all(
    Array.from({ length: 20 }, () => module.getWorkspaceSession()),
  );
  assert.equal(sessions, 1);
  assert.ok(concurrent.every((value) => value.user.id === "Owner"));
  await module.getWorkspaceSession();
  assert.equal(sessions, 1, "fresh per-tab access session is cached");
  now += 95_000;
  assert.equal((await module.getWorkspaceSession()).user.id, "Owner");
  assert.equal(
    refreshes,
    1,
    "refresh occurs before expiration, even while the backend still accepts the old access token",
  );
  const other = await module.signInHosted("Other@example.com", "password");
  assert.equal(other.user.id, "Other");
  assert.equal((await module.getWorkspaceSession()).user.id, "Other");
  assert.ok(localStorage.getItem(module.WORKSPACE_SESSION_CHANGED));
  current = session("Third");
  const changed = new Event("storage");
  Object.defineProperty(changed, "key", { value: module.WORKSPACE_SESSION_CHANGED });
  window.dispatchEvent(changed);
  assert.equal(
    (await module.getWorkspaceSession()).user.id,
    "Third",
    "another tab's account change clears the old cached owner",
  );
  const retried = await module.authenticatedFetch("/api/local", { method: "POST" }, "Sign in");
  assert.equal(retried.status, 200, "a revoked access token is refreshed and retried once");
  assert.equal(protectedCalls, 2);
  await module.signOutWorkspace();
  assert.equal(await module.getWorkspaceSession(), null);
  assert.equal(await module.signUpHosted("New@example.com", "password", "New"), null);
  console.log(
    "Workspace session checks passed: coalesced reads, caching, proactive refresh, account switches, cross-tab invalidation, refresh-and-retry, logout and verification-required signup.",
  );
} finally {
  globalThis.fetch = previous.fetch;
  Date.now = previous.now;
  for (const name of ["window", "sessionStorage", "localStorage"]) {
    if (previous[name] === undefined) delete globalThis[name];
    else globalThis[name] = previous[name];
  }
}

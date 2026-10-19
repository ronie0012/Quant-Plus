import { test } from "node:test";
import assert from "node:assert/strict";
import { safeWorkspaceReturn } from "./workspace-return.ts";

test("sign-in preserves a workspace destination and its research context", () => {
  assert.equal(
    safeWorkspaceReturn("/app/journal?symbol=RELIANCE&plan=draft#evidence"),
    "/app/journal?symbol=RELIANCE&plan=draft#evidence",
  );
  assert.equal(safeWorkspaceReturn("/app/stocks/HDFCBANK"), "/app/stocks/HDFCBANK");
});

test("sign-in rejects external, malformed and non-workspace return locations", () => {
  for (const value of [
    undefined,
    null,
    42,
    "",
    "https://example.com/app/journal",
    "//example.com/app/journal",
    "/auth",
    "/app/../auth",
    "/app/../../external",
    "/app/\\example.com",
    "/app/journal\n",
    "/app/journal\u0000",
    "/app/journal x",
    `/app/${"x".repeat(2048)}`,
  ]) {
    assert.equal(safeWorkspaceReturn(value), "/app/dashboard", String(value));
  }
});

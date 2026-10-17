import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const incomplete = spawnSync(
  process.execPath,
  ["--expose-gc", "scripts/soak.mjs", "--minutes", "0.000001", "--sessions", "10"],
  { encoding: "utf8", timeout: 15_000, windowsHide: true },
);
assert.notEqual(incomplete.status, 0, "zero-session runs must never succeed");
assert.match(incomplete.stderr, /Incomplete soak/);
const report = JSON.parse(incomplete.stdout);
assert.equal(report.status, "incomplete");
assert.equal(report.requested_sessions, 10);
assert.equal(report.simulated_sessions_completed, 0);
const invalid = spawnSync(process.execPath, ["scripts/soak.mjs", "--sessions", "0"], {
  encoding: "utf8",
  timeout: 15_000,
  windowsHide: true,
});
assert.notEqual(invalid.status, 0);
assert.match(invalid.stderr, /positive integer/);
console.log(
  "Soak coverage checks passed: zero-session deadline and invalid targets fail rather than falsely certify coverage.",
);

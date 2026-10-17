// Default is read-only rehearsal. --apply imports into an EMPTY hosted book only.
// Auth identity comes from the linked project's CLI, never from a caller-supplied UUID.
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { resolve, join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { localTestModule } from "./local-test-module.mjs";
import { loadEnv } from "vite";

const email = process.argv[process.argv.indexOf("--email") + 1];
if (
  !process.argv.includes("--email") ||
  !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email ?? "")
)
  throw new Error("Use --email with the explicitly selected application-user email");
const apply = process.argv.includes("--apply");
const root = resolve(".");
const path = resolve(
  process.env.LOCAL_DATA_FILE ||
    loadEnv("development", root, "LOCAL_DATA_FILE")["LOCAL_DATA_FILE"] ||
    ".local-data/workspace.json",
);
const selected = JSON.parse(readFileSync(".local-data/migration-owner.json", "utf8"));
if (selected.email?.toLowerCase() !== email.toLowerCase())
  throw new Error("The supplied email does not match the explicitly selected migration owner");
if (!path.toLowerCase().startsWith((root + "\\").toLowerCase()))
  throw new Error("Source must remain inside this workspace");
const query = `SELECT id, email, email_verified, is_project_admin, is_anonymous FROM auth.users WHERE lower(email) = '${email.toLowerCase()}'`;
// SQL is stdin DATA to a fixed PowerShell program; it is never interpolated into shell code.
const lookup = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    '$ownerMigrationQuery = [Console]::In.ReadToEnd(); & npx.cmd -y "@insforge/cli" db query $ownerMigrationQuery --json',
  ],
  { input: query, encoding: "utf8", windowsHide: true, timeout: 60_000 },
);
if (lookup.status !== 0)
  throw new Error("Verified-owner lookup failed; check the linked CLI connection");
const rows = JSON.parse(lookup.stdout).rows;
if (rows.length !== 1)
  throw new Error(
    "The selected email has no application account. Register and verify that account before transfer; the local book is unchanged.",
  );
const { prepareOwnerMigration } = localTestModule("@/lib/book-migration.server");
const { bookDelta, importEmptyHostedBook } = localTestModule("@/lib/insforge-book.server");
const { newBook } = localTestModule("@/lib/paper-book/engine");
const { clockAt } = localTestModule("@/lib/paper-book/types");
const project = JSON.parse(readFileSync(".insforge/project.json", "utf8"));
const config = { url: project.oss_host.replace(/\/$/, ""), apiKey: project.api_key };
let lock;
try {
  if (apply) {
    lock = openSync(`${path}.lock`, "wx", 0o600);
    writeFileSync(
      lock,
      JSON.stringify({ pid: process.pid, host: hostname(), created_at: new Date().toISOString() }),
    );
  }
  const raw = readFileSync(path, "utf8");
  const prepared = prepareOwnerMigration(raw, rows[0], email);
  // Read as admin only to inspect the exact owner; never overwrite an existing book.
  const response = await fetch(
    `${config.url}/api/database/records/paper_books?user_id=eq.${encodeURIComponent(rows[0].id)}&select=version`,
    { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error("Could not inspect hosted destination");
  if ((await response.json()).length)
    throw new Error("Destination already has a book. Automatic merging/overwriting is refused.");
  // Validate every relational projection before taking a backup or making a commit.
  bookDelta(newBook(rows[0].id, clockAt()), prepared.state);
  const report = {
    mode: apply ? "applied" : "rehearsal",
    source_sha256: prepared.sourceSha256,
    ...prepared.summary,
  };
  if (apply) {
    const backup = join(
      root,
      ".local-data/backups",
      `owner-migration-${randomUUID()}`,
      "workspace.json",
    );
    mkdirSync(dirname(backup), { recursive: true });
    writeFileSync(backup, raw, { flag: "wx", mode: 0o600 });
    await importEmptyHostedBook(config, rows[0].id, prepared.state);
    if (createHash("sha256").update(readFileSync(path)).digest("hex") !== prepared.sourceSha256)
      throw new Error(
        "Source changed unexpectedly. Hosted copy exists; do not cut over until reconciled.",
      );
    report.backup = backup;
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (lock !== undefined) {
    closeSync(lock);
    unlinkSync(`${path}.lock`);
  }
}

// Run with: node scripts/release-manifest.mjs [--tests audit/implementation/release/test-summary.json]
// Writes audit/implementation/release/manifest-<date>.json: source revision and working-tree
// state, runtime and dependency versions, SHA-256 of reference data, migrations and the built
// artifact, the evidence files (benchmarks, soak, live checks) and the recorded test summary.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      })
    : [];
const rel = (file) => relative(root, file).replaceAll("\\", "/");
const hashes = (files) => Object.fromEntries(files.sort().map((f) => [rel(f), sha(f)]));

const testsIndex = process.argv.indexOf("--tests");
const testsFile = join(
  root,
  testsIndex > 0 ? process.argv[testsIndex + 1] : "audit/implementation/release/test-summary.json",
);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const installed = (name) => lock.packages?.[`node_modules/${name}`]?.version ?? null;

const artifactFiles = walk(join(root, ".output")).sort();
const artifactDigest = createHash("sha256");
for (const file of artifactFiles) artifactDigest.update(`${rel(file)}\0${sha(file)}\n`);

const status = git("status", "--porcelain");
const manifest = {
  generated_at: new Date().toISOString(),
  source: {
    commit: git("rev-parse", "HEAD"),
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    uncommitted_paths: status ? status.split("\n").length : 0,
    note: status
      ? "Built from an uncommitted working tree; the commit alone does not reproduce this build."
      : "Clean working tree.",
  },
  runtime: { node: process.version, platform: process.platform },
  dependencies: Object.fromEntries(
    Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      .sort()
      .map((n) => [n, installed(n)]),
  ),
  reference_data: hashes(
    [
      ...walk(join(root, "audit/implementation/reference")),
      join(root, "audit/implementation/reference-data.json"),
      join(root, "src/lib/exchange-calendar.ts"),
      join(root, "backend-extension/quantplus_intelligence/nse_calendar.json"),
      join(root, "src/data/instrument-master.ts"),
      join(root, "src/lib/paper-fees.ts"),
    ].filter(existsSync),
  ),
  migrations: hashes(walk(join(root, "migrations")).filter((f) => f.endsWith(".sql"))),
  backend_patches: hashes(
    walk(join(root, "audit/implementation")).filter((f) =>
      /backend-patch-[^/\\]+[/\\].+\.(patch|diff|py|json)$/.test(f),
    ),
  ),
  artifact: existsSync(join(root, ".output"))
    ? {
        directory: ".output",
        files: artifactFiles.length,
        tree_sha256: artifactDigest.digest("hex"),
        server_entry_sha256: sha(join(root, ".output/server/index.mjs")),
      }
    : null,
  evidence: hashes([
    ...walk(join(root, "audit/implementation/benchmarks")),
    ...walk(join(root, "audit/implementation/soak")),
    ...walk(join(root, "audit/implementation/insforge")).filter((f) => f.endsWith(".md")),
  ]),
  tests: existsSync(testsFile) ? JSON.parse(readFileSync(testsFile, "utf8")) : null,
};
const outDir = join(root, "audit/implementation/release");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `manifest-${manifest.generated_at.slice(0, 10).replaceAll("-", "")}.json`);
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Wrote ${rel(out)}: commit ${manifest.source.commit.slice(0, 7)}, ${Object.keys(manifest.reference_data).length} reference files, ${artifactFiles.length} artifact files, tests ${manifest.tests ? "recorded" : "missing"}.`,
);

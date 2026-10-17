import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const output = "audit/implementation";
mkdirSync(output, { recursive: true });
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const paths = [...files("src"), ...files("backend-extension")].filter((path) =>
  /\.(tsx?|py)$/.test(path),
);
const inventory = paths.map((path) => {
  const source = readFileSync(path, "utf8");
  const lines = source.split(/\r?\n/);
  return {
    path: path.replaceAll("\\", "/"),
    sha256: createHash("sha256").update(source).digest("hex"),
    routes: [...source.matchAll(/createFileRoute\("([^"\n]+)"\)/g)].map((match) => match[1]),
    actions: lines.flatMap((line, index) =>
      /onClick=|onSubmit=|onChange=|mutationFn:/.test(line)
        ? [
            {
              line: index + 1,
              source: line.trim(),
              review: "pending: trace handler, side effects, error and browser evidence",
            },
          ]
        : [],
    ),
    quantitativeFields: lines.flatMap((line, index) =>
      /formatINR\(|formatNum\(|<ProgressBar|<MetricStrip|<AnimatedNumber/.test(line)
        ? [
            {
              line: index + 1,
              source: line.trim(),
              review: "pending: document lineage, formula and missing state",
            },
          ]
        : [],
    ),
  };
});
const audit = readFileSync("PROJECT_DEEP_AUDIT.md", "utf8");
const defects = audit
  .split(/\r?\n/)
  .filter((line) => /^\| (?:EXEC|STORE|DATA|NEWS|SENT|AI|CHAT|UX|OPS|DOC)-\d+\s*\|/.test(line))
  .map((line) => {
    const [, id, evidence, finding, module] = line.split("|").map((part) => part.trim());
    return {
      id,
      evidence,
      finding,
      module,
      status: "open until desired-behavior evidence and phase gate review",
    };
  });
function git(path) {
  return execFileSync("git", ["-C", path, "status", "--porcelain=v1"], { encoding: "utf8" });
}
writeFileSync(
  join(output, "inventory.json"),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      scope: "Static discovery inventory; manual and browser coverage remain pending",
      files: inventory,
    },
    null,
    2,
  ),
);
writeFileSync(join(output, "defects.json"), JSON.stringify(defects, null, 2));
writeFileSync(
  join(output, "baseline.json"),
  JSON.stringify(
    {
      captured_at: new Date().toISOString(),
      scope: "Implementation checkpoint; original audit evidence remains immutable",
      node: process.version,
      app_status: git("."),
      backend_status: git("D:/QP/agent-service"),
      locks: ["package-lock.json"].map((path) => ({
        path,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      })),
      schema: "JSON v1 with additive integrity metadata; InsForge cutover pending",
    },
    null,
    2,
  ),
);
console.log(
  `Recorded ${inventory.length} source files, ${inventory.reduce((n, file) => n + file.actions.length, 0)} action sites and ${defects.length} audit defects. Manual inventory review remains open.`,
);

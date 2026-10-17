import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src");

function resolveSource(name, from) {
  let base;
  if (name.startsWith("@/")) base = join(source, name.slice(2));
  else if (name.startsWith("./") || name.startsWith("../")) base = resolve(from, name);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")])
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  return null;
}

/**
 * Loads application TypeScript modules for script tests without a bundler.
 * Each top-level call returns fresh module instances so tests can reload persisted state.
 */
export function localTestModule(name, from = join(source, "lib"), fresh = new Map()) {
  const file = resolveSource(name, from);
  if (!file) return nodeRequire(name);
  if (fresh.has(file)) return fresh.get(file).exports;
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: relative(root, file),
  }).outputText;
  const module = { exports: {} };
  fresh.set(file, module);
  new Function("exports", "require", "module", code)(
    module.exports,
    (child) => localTestModule(child, dirname(file), fresh),
    module,
  );
  return module.exports;
}

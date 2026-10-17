import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
const forbidden = new Set([
  "series",
  "useLiveQuotes",
  "stockStats",
  "agentViews",
  "committeeVerdict",
  "stockNews",
  "stockDepth",
  "stockSentiment",
]);
const violations = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!/\.tsx?$/.test(path) || /\.test\.tsx?$/.test(path)) continue;
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node)) continue;
      const module = node.moduleSpecifier.text;
      if (/fixtures?|__tests__|mock-market|synthetic-market/.test(module))
        violations.push(`${path}: runtime fixture import ${module}`);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements)
          if (forbidden.has(item.propertyName?.text ?? item.name.text))
            violations.push(`${path}: generated market import ${item.name.text}`);
    }
  }
}
walk("src");
assert.deepEqual(violations, [], "Product code must not import runtime market fixtures/generators");
console.log(
  "Runtime market import audit passed. This check does not establish complete observation lineage.",
);

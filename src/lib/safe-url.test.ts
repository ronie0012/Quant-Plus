import { test } from "node:test";
import assert from "node:assert/strict";
import { safeExternalUrl } from "./safe-url.ts";

test("safeExternalUrl keeps web links and rejects executable or malformed schemes", () => {
  assert.equal(safeExternalUrl("https://example.com/news"), "https://example.com/news");
  assert.equal(safeExternalUrl("http://example.com/news"), "http://example.com/news");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("data:text/html,alert(1)"), null);
  assert.equal(safeExternalUrl("not a URL"), null);
  assert.equal(safeExternalUrl(null), null);
});

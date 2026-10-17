// The Node book and the Python intelligence extension must use the same verified calendar.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localTestModule } from "./local-test-module.mjs";

const { NSE_CALENDAR, NSE_CALENDAR_VERSION } = localTestModule("@/lib/exchange-calendar");
const python = JSON.parse(
  readFileSync(
    new URL("../backend-extension/quantplus_intelligence/nse_calendar.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(python.version, NSE_CALENDAR_VERSION);
assert.deepEqual(Object.keys(python.years).sort(), Object.keys(NSE_CALENDAR).sort());
for (const [year, data] of Object.entries(python.years)) {
  assert.deepEqual(data.holidays, NSE_CALENDAR[year].holidays, `${year} holidays`);
  assert.deepEqual(
    data.special_sessions,
    NSE_CALENDAR[year].special_sessions,
    `${year} special sessions`,
  );
  assert.deepEqual(data.sources, NSE_CALENDAR[year].sources, `${year} sources`);
}
console.log(`Calendar parity passed: ${NSE_CALENDAR_VERSION} is identical in Node and Python.`);

// The generated instrument master must match the committed official NSE files.
import { createHash } from "node:crypto";
const { INSTRUMENT_MASTER_SOURCE, NIFTY50_MASTER } = localTestModule("@/data/instrument-master");
const reference = (name) =>
  createHash("sha256")
    .update(readFileSync(new URL(`../audit/implementation/reference/nse/${name}`, import.meta.url)))
    .digest("hex");
assert.equal(reference("ind_nifty50list-20261014.csv"), INSTRUMENT_MASTER_SOURCE.index_sha256);
assert.equal(reference("EQUITY_L-20261014.csv"), INSTRUMENT_MASTER_SOURCE.equity_sha256);
assert.equal(NIFTY50_MASTER.length, 50);
assert.ok(NIFTY50_MASTER.every((item) => /^INE[0-9A-Z]{9}$/.test(item.isin)));
console.log(
  `Instrument master matches official NSE files retrieved ${INSTRUMENT_MASTER_SOURCE.retrieved}.`,
);

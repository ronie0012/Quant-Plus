import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { regularNseSession, quoteIsStale } from "./market-session.ts";
import { dayOrderExpiry, sessionDay } from "./exchange-calendar.ts";

describe("NSE session boundaries", () => {
  it("uses India time and excludes the exact close", () => {
    assert.equal(regularNseSession(new Date("2026-10-12T03:44:00Z")), false);
    assert.equal(regularNseSession(new Date("2026-10-12T03:45:00Z")), true);
    assert.equal(regularNseSession(new Date("2026-10-12T09:59:00Z")), true);
    assert.equal(regularNseSession(new Date("2026-10-12T10:00:00Z")), false);
    assert.equal(regularNseSession(new Date("2026-10-11T05:00:00Z")), false);
  });
  it("uses the official holiday calendar and fails closed on unverified sessions", () => {
    // Dussehra (NSE/CMTR/71775) and the election holiday (NSE/CMTR/72260).
    assert.equal(regularNseSession(new Date("2026-10-20T05:00:00Z")), false);
    assert.equal(regularNseSession(new Date("2026-01-15T05:00:00Z")), false);
    assert.equal(regularNseSession(new Date("2026-10-21T05:00:00Z")), true);
    // Muhurat timings have not been notified; a Sunday evening is not tradable.
    assert.equal(regularNseSession(new Date("2026-11-08T12:45:00Z")), false);
  });
  it("assigns DAY orders to the session they rest in", () => {
    const close = (date: string) => Date.parse(`${date}T15:30:00+05:30`);
    assert.equal(dayOrderExpiry(Date.parse("2026-10-14T05:00:00Z")), close("2026-10-14"));
    // After the close, an order rests until the next session (Oct 15).
    assert.equal(
      dayOrderExpiry(Date.parse("2026-10-14T11:00:00Z")),
      close("2026-10-14") + 86400000,
    );
    // Friday after close skips the weekend to Monday, October 19.
    assert.equal(dayOrderExpiry(Date.parse("2026-10-16T11:00:00Z")), close("2026-10-19"));
    // Monday after close skips Tuesday's Dussehra holiday.
    assert.equal(dayOrderExpiry(Date.parse("2026-10-19T11:00:00Z")), close("2026-10-21"));
    assert.equal(sessionDay("2027-01-04").status, "UNVERIFIED_YEAR");
    assert.equal(sessionDay("2026-11-08").status, "SPECIAL_UNVERIFIED");
  });
  it("distinguishes closed snapshots from stale live quotes", () => {
    const now = Date.parse("2026-10-12T05:00:00Z");
    const old = { as_of: "2026-10-09T10:00:00Z", stale: true, market_session: "closed" };
    assert.equal(quoteIsStale(old, true, now), false);
    assert.equal(quoteIsStale(old, false, now), true);
    assert.equal(quoteIsStale({ ...old, market_session: "open" }, true, now), true);
    assert.equal(quoteIsStale({ ...old, as_of: "invalid" }, true, now), true);
    assert.equal(quoteIsStale({ ...old, as_of: "2026-10-13T05:00:00Z" }, true, now), true);
  });
});

import { test as base, expect, type Page } from "@playwright/test";
import type { Prediction } from "../../src/lib/agent-api";

// Use the repository's isolated 4179 configuration. Every API call is intercepted;
// neither the real workspace nor a provider/model/order endpoint is contacted.
const origin = "http://127.0.0.1:4179";
const cutoff = "2026-10-19T10:00:00Z";
const oldCutoff = "2026-10-19T09:00:00Z";
const saved: Prediction = {
  id: "1111111111111111",
  instrument: "RELIANCE.NS",
  as_of: oldCutoff,
  status: "done",
  refresh_seconds: 900,
  analysis_interval: "1d",
  decision: {
    action: "hold",
    rationale: "Completed fixture counter-case retained.",
    authority: "RESEARCH_ONLY",
  },
  thesis: null,
  challenge: null,
  proposal: null,
  reports: {
    technical: {
      agent: "technical",
      confidence: 0.5,
      summary: "Completed fixture analyst report.",
    },
  },
  events: [{ stage: "claim_validation", agent: "technical", status: "verified", ts: oldCutoff }],
  serving: {
    freshness: "stale",
    age_seconds: 3600,
    refresh_status: "idle",
    data_cutoff: oldCutoff,
    mode: "full_research",
  },
};
type Fixture = {
  phase: "queued" | "partial" | "failed_provider" | "done";
  offline: boolean;
  paused: boolean;
  requests: { method: string; path: string }[];
  forbidden: string[];
};

function session(phase: Fixture["phase"]): Prediction {
  const partial = phase !== "queued";
  return {
    ...saved,
    id: "2222222222222222",
    as_of: cutoff,
    status: phase === "partial" ? "running" : phase,
    previous_result: null, // Exercise the client's cached-completion preservation.
    serving: { ...saved.serving!, freshness: "fresh", age_seconds: 0, data_cutoff: cutoff },
    decision:
      phase === "done"
        ? {
            action: "hold",
            rationale: "New completed fixture research.",
            authority: "RESEARCH_ONLY",
          }
        : null,
    reports: partial
      ? {
          technical: { agent: "technical", confidence: 0.6, summary: "New saved analyst finding." },
        }
      : {},
    events: partial
      ? [{ stage: "claim_validation", agent: "technical", status: "unverified", ts: cutoff }]
      : [{ stage: "session", agent: "orchestrator", status: "queued", ts: cutoff }],
    thesis: partial
      ? {
          direction: "flat",
          conviction: 0.5,
          key_evidence: ["Provisional fixture evidence."],
          key_risks: ["Fixture uncertainty."],
        }
      : null,
  };
}

const test = base.extend<{ prediction: Fixture }>({
  prediction: [
    async ({ page, baseURL }, use) => {
      expect(baseURL).toBe(origin);
      const fixture: Fixture = {
        phase: "queued",
        offline: false,
        paused: false,
        requests: [],
        forbidden: [],
      };
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.clock.install({ time: new Date(cutoff) });
      await page.addInitScript(() =>
        sessionStorage.setItem("quant-plus:welcome-dismissed", "true"),
      );
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
        if (path === "/api/local") {
          const body = request.postDataJSON();
          if (body.rpc === "risk_status")
            return json({ blocked: false, stale_marks: [], available_cash: 100000 });
          if (body.rpc === "notifications") return json({ events: [], latest_seq: 0 });
          if (body.rpc || (body.operation && body.operation !== "select")) {
            fixture.forbidden.push(`${path}:${body.rpc ?? body.operation}`);
            return json({ error: "Unexpected workspace mutation" }, 503);
          }
          if (body.table === "accounts")
            return json({
              currency: "INR",
              wallet_balance: 100000,
              total_funds: 100000,
              onboarded: true,
            });
          if (body.table === "trading_preferences" || body.table === "risk_limits")
            return json(null);
          return json(
            body.singular ? null : body.count ? { rows: [], total: 0, limit: 100, offset: 0 } : [],
          );
        }
        if (
          path === "/api/agent/stocks/RELIANCE/prediction" ||
          path.startsWith("/api/agent/stocks/sessions/")
        ) {
          fixture.requests.push({ method: request.method(), path: `${path}${url.search}` });
          if (fixture.offline && request.method() === "GET")
            return json({ detail: "Fixture status connection lost" }, 503);
          if (url.searchParams.get("retry") === "true") fixture.phase = "queued";
          const result = fixture.paused
            ? {
                ...saved,
                refresh_seconds: 60,
                serving: { ...saved.serving!, refresh_status: "paused" },
              }
            : session(fixture.phase);
          // The first accepted start supplies a real prior completion. Later GETs
          // omit it; the client must not erase the previously observed output.
          return json(
            fixture.requests.length === 1 && result.status !== "done"
              ? { ...result, previous_result: saved }
              : result,
            request.method() === "POST" ? 202 : 200,
          );
        }
        if (path.endsWith("/history"))
          return json({
            symbol: "RELIANCE",
            source: "fixture",
            as_of: cutoff,
            interval: "1d",
            candles: [],
          });
        if (path === "/api/agent/stocks/predictions") return json({ predictions: {} });
        if (path === "/api/agent/market/stream")
          return route.fulfill({ contentType: "text/event-stream", body: "" });
        if (
          path === "/api/chat" ||
          (path.includes("/orders") && request.method() !== "GET") ||
          (path.endsWith("/prediction") && request.method() === "POST")
        )
          fixture.forbidden.push(path);
        return json({ detail: "Supplementary data unavailable in prediction fixture" }, 503);
      });
      await use(fixture);
      expect(fixture.forbidden).toEqual([]);
    },
    { auto: true },
  ],
});
test.use({ serviceWorkers: "block" });

// Let the browser settle each mocked response, including React Query's batched
// notifications, while advancing virtual time instead of sleeping for polling.
async function until(page: Page, condition: () => Promise<boolean> | boolean) {
  await expect
    .poll(
      async () => {
        await page.clock.runFor(250);
        return condition();
      },
      { intervals: [10, 25, 50], timeout: 10_000 },
    )
    .toBe(true);
}

test("saved decisions stay visible as real partial findings arrive across stock/committee navigation", async ({
  page,
  prediction,
}, testInfo) => {
  await page.goto("/app/committee");
  await expect(page.getByText(saved.decision!.rationale)).toBeVisible();
  await expect(page.getByLabel("Completed analyst reports")).toContainText(
    "numbers match its input data",
  );
  await page.getByRole("textbox", { name: "NSE symbol for research" }).fill("TCS");
  await page.getByRole("textbox", { name: "NSE symbol for research" }).fill("RELIANCE");
  expect(prediction.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 100));
  prediction.phase = "partial";
  await until(page, () => page.getByLabel("New analysis findings").isVisible());
  const findings = page.getByLabel("New analysis findings");
  await expect(findings).toContainText("states numbers not in its input data");
  await findings.locator("summary").filter({ hasText: "technical" }).click();
  await expect(findings.getByText("New saved analyst finding.")).toBeVisible();
  await findings.getByText("Provisional synthesis", { exact: true }).click();
  await expect(findings.getByText("Provisional fixture evidence.")).toBeVisible();
  await expect(page.getByText(saved.decision!.rationale)).toBeVisible();

  await page.clock.resume();
  await page.getByRole("link", { name: "Open RELIANCE workspace" }).click();
  await expect(page.getByRole("heading", { name: "RELIANCE", exact: true })).toBeVisible();
  await expect(page.getByLabel("New analysis findings")).toBeVisible();
  const postCount = () => prediction.requests.filter((request) => request.method === "POST").length;
  expect(postCount()).toBe(1);
  await page.getByRole("button", { name: "1W", exact: true }).click();
  expect(postCount(), "Chart interval changes do not change daily research identity").toBe(1);

  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 100));
  prediction.phase = "done";
  await until(page, () =>
    page.getByText("New completed fixture research.", { exact: true }).first().isVisible(),
  );
  await expect(page.getByLabel("New analysis findings")).toHaveCount(0);
  await expect(page.getByText(saved.decision!.rationale, { exact: true })).toHaveCount(0);
  await page.clock.runFor(20_000);
  await page.clock.resume();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Investment committee" })).toBeVisible();
  await expect(page.getByText("New completed fixture research.", { exact: true })).toBeVisible();
  expect(postCount(), "A fresh completed session is reused on a 20-second remount").toBe(1);
  await testInfo.attach("prediction-requests", {
    body: JSON.stringify(prediction.requests, null, 2),
    contentType: "application/json",
  });
});

test("operator-paused refresh keeps cached research without claiming that new analysis is running", async ({
  page,
  prediction,
}) => {
  prediction.paused = true;
  await page.goto("/app/committee");
  await expect(page.getByText(saved.decision!.rationale)).toBeVisible();
  await expect(page.getByText("Refresh paused by operator", { exact: true })).toBeVisible();
  await expect(page.getByText("Full analysis refreshing", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("New analysis findings")).toHaveCount(0);
  await page.clock.runFor(20_000);
  expect(prediction.requests).toHaveLength(1);
});

test("a status outage pauses polling; failed sessions only resume on explicit retry", async ({
  page,
  prediction,
}, testInfo) => {
  await page.goto("/app/committee");
  await expect(page.getByText(saved.decision!.rationale)).toBeVisible();
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 100));
  prediction.offline = true;
  await until(page, () => page.getByText(/Automatic status updates are paused/).isVisible());
  const pausedCalls = prediction.requests.length;
  await page.clock.runFor(10_000);
  expect(prediction.requests).toHaveLength(pausedCalls);
  await expect(page.getByText(saved.decision!.rationale)).toBeVisible();

  prediction.offline = false;
  prediction.phase = "failed_provider";
  await page.getByRole("button", { name: "Refresh analysis status" }).click();
  await until(page, () =>
    page.getByRole("button", { name: "Retry analysis", exact: true }).isVisible(),
  );
  const failedCalls = prediction.requests.length;
  await page.clock.runFor(60_000);
  expect(prediction.requests).toHaveLength(failedCalls);
  await expect(page.getByLabel("New analysis findings")).toBeVisible();
  await expect(page.getByLabel("Completed analyst reports")).toBeVisible();
  await page
    .getByRole("button", { name: "Retry analysis", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await until(page, () =>
    prediction.requests.some((request) => request.path.endsWith("?retry=true")),
  );
  expect(
    prediction.requests.filter((request) => request.path.endsWith("?retry=true")),
  ).toHaveLength(1);
  await until(page, () =>
    page.getByText("0 analyst reports received", { exact: true }).isVisible(),
  );
  await expect(page.getByText(saved.decision!.rationale)).toBeVisible();
  expect(prediction.requests.filter((request) => request.method === "POST")).toHaveLength(2);
  await testInfo.attach("prediction-recovery-requests", {
    body: JSON.stringify(prediction.requests, null, 2),
    contentType: "application/json",
  });
});

import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

// https://playwright.dev/docs/test-webserver
// Never reuse a developer server: the test book and provider settings must be isolated.
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["list"], ["json", { outputFile: "test-results/browser.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4179",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      LOCAL_DATA_FILE: resolve(`.local-data/browser-tests/${randomUUID()}.json`),
      AGENT_SERVICE_URL: "http://127.0.0.1:9",
      AGENT_SERVICE_API_KEY: "isolated-browser-test-key",
      OPENROUTER_API_KEY: "",
    },
  },
});

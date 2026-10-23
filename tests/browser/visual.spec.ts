import { test, expect } from "@playwright/test";
import { marketFixture } from "./market-fixture";

// Visual regression: key screens rendered from fixed market fixtures at a
// frozen clock. Update baselines deliberately with `npx playwright test
// tests/browser/visual.spec.ts --update-snapshots` after an intended change.

const screens = [
  { name: "stock-desktop", path: "/app/stocks/RELIANCE", width: 1440, height: 900 },
  { name: "screener-desktop", path: "/app/screener", width: 1440, height: 900 },
  { name: "options-desktop", path: "/app/options", width: 1440, height: 900 },
  { name: "stock-mobile", path: "/app/stocks/RELIANCE", width: 390, height: 844 },
];

for (const screen of screens) {
  test(`visual: ${screen.name}`, async ({ page }) => {
    await marketFixture(page);
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto(screen.path);
    await expect(page.locator("main h1:visible")).toHaveCount(1);
    if (screen.path === "/app/options")
      await expect(page.getByRole("heading", { name: "Options unavailable" })).toBeVisible({
        timeout: 15_000,
      });
    if (screen.path.startsWith("/app/stocks/"))
      await expect(page.getByRole("img", { name: /OHLC chart/ })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`${screen.name}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      // Toasts and the AI dock are not part of the layout under test.
      mask: [page.locator("[data-sonner-toaster]")],
    });
  });
}

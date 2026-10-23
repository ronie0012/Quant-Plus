import { test, expect } from "@playwright/test";
import { marketFixture } from "./market-fixture";

test("chart: indicators persist, drawings save per symbol and alerts are set from the chart", async ({
  page,
}) => {
  const { tables } = await marketFixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/stocks/RELIANCE");
  const chart = page.getByRole("img", { name: /OHLC chart/ });
  await expect(chart).toBeVisible();

  // Indicators menu: enabling MACD and VWAP updates the legend and is remembered.
  await page.getByRole("button", { name: "Indicators" }).click();
  await page.getByRole("menuitemcheckbox", { name: /MACD/ }).click();
  await page.getByRole("menuitemcheckbox", { name: /Supertrend/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText(/^MACD /).first()).toBeVisible();
  await expect(page.getByText(/^ST /).first()).toBeVisible();

  // Horizontal line: one click on the price pane draws and stores it.
  await page.getByRole("button", { name: "Horizontal line" }).click();
  await expect(page.getByText("Horizontal line: click a price")).toBeVisible();
  const box = (await chart.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
  await expect(page.getByText(/1 drawings/)).toBeVisible();

  // Trend line needs two points.
  await page.getByRole("button", { name: "Trend line" }).click();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.25);
  await expect(page.getByText("Click the second point · Esc cancels")).toBeVisible();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.2);
  await expect(page.getByText(/2 drawings/)).toBeVisible();
  await chart.screenshot({ path: test.info().outputPath("chart-drawings.png") });

  // Alert tool writes a real price alert at the clicked level.
  await page.getByRole("button", { name: "Add price alert" }).click();
  // The top of the price pane is above every bar, so this is an "above" alert.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.03);
  await expect.poll(() => tables["price_alerts"]?.length ?? 0).toBe(1);
  const alert = tables["price_alerts"]![0]!;
  expect(alert["symbol"]).toBe("RELIANCE");
  expect(alert["alert_type"]).toBe("PRICE_ABOVE");
  const threshold = Number(alert["threshold"]);
  expect(Math.abs(threshold * 20 - Math.round(threshold * 20))).toBeLessThan(1e-6);

  // Layout and drawings survive a reload; undo removes the latest drawing.
  await page.reload();
  await expect(chart).toBeVisible();
  await expect(page.getByText(/^MACD /).first()).toBeVisible();
  await expect(page.getByText(/2 drawings/)).toBeVisible();
  await page.getByRole("button", { name: "Undo last drawing" }).click();
  await expect(page.getByText(/1 drawings/)).toBeVisible();

  // Interval selector re-requests history with the chosen bar size.
  const requested = page.waitForRequest((request) =>
    request.url().includes("/history?range=1W&interval=5m"),
  );
  await page
    .getByRole("group", { name: "Chart range" })
    .getByRole("button", { name: "1W" })
    .click();
  await page.getByLabel("Bar interval").selectOption("5m");
  await requested;
});

test("stock page: Buy and Sell open the paper ticket with the side preselected", async ({
  page,
}) => {
  await marketFixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/stocks/RELIANCE");
  await page.getByRole("button", { name: /^Sell/ }).click();
  await expect(page.getByRole("dialog")).toContainText(/sell/i);
  await page.keyboard.press("Escape");
  await page.locator("body").press("b");
  await expect(page.getByRole("dialog")).toContainText(/buy/i);
});

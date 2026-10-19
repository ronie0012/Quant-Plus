import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Public pages must remain useful without touching a book, a model or a market provider.
// Block those boundaries even if a future link accidentally enables route preloading.
const test = base.extend<{ publicRequests: string[] }>({
  publicRequests: [
    async ({ context, baseURL }, use) => {
      const requests: string[] = [];
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(baseURL!).origin) {
          if (route.request().resourceType() !== "font" && !url.hostname.startsWith("fonts.")) {
            requests.push(url.origin + url.pathname);
          }
          await route.abort();
        } else if (url.pathname.startsWith("/api/")) {
          requests.push(url.pathname);
          await route.fulfill({ status: 503, json: { error: "Isolated public UX test" } });
        } else {
          await route.continue();
        }
      });
      await use(requests);
      expect(
        requests,
        "Public browsing must not call account, trade, model or provider APIs",
      ).toEqual([]);
    },
    { auto: true },
  ],
});

const pages = [
  { path: "/", title: "Understand the market. Practise your decisions." },
  { path: "/platform", title: "A workspace for better market habits." },
  { path: "/markets", title: "Find the context behind a stock." },
  { path: "/research", title: "Build a view you can revisit." },
  { path: "/ai", title: "Better questions. More considered decisions." },
] as const;

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
]) {
  test.describe(`${viewport.width}px public pages`, () => {
    test.use({ viewport, reducedMotion: "reduce" });

    for (const entry of pages) {
      test(`${entry.path} has a clear hierarchy, paper entry and accessible navigation`, async ({
        page,
      }, testInfo) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(entry.path);
        const main = page.getByRole("main");
        await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(entry.title);
        await expect(
          main.getByRole("link", { name: "Open paper terminal", exact: true }).first(),
        ).toHaveAttribute("href", "/app/dashboard");
        await expect(main.getByText(/Virtual funds only/i).first()).toBeVisible();
        await expect(page.getByRole("contentinfo")).toContainText(
          "does not place real broker orders",
        );
        await expect(
          page
            .getByRole("navigation", { name: "Footer workspace" })
            .getByRole("link", { name: "Start learning" }),
        ).toHaveAttribute("href", "/app/learn");
        if (viewport.width >= 1024) {
          const nav = page.getByRole("navigation", { name: "Primary", exact: true });
          await expect(nav).toBeVisible();
          await expect(nav.getByRole("link", { name: "Learn", exact: true })).toHaveAttribute(
            "href",
            "/app/learn",
          );
          if (entry.path !== "/") {
            await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", entry.path);
          }
        } else {
          await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
          await expect(page.getByRole("dialog")).toHaveCount(0);
        }
        await expectNoOverflow(page);
        const accessibility = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          accessibility.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
          ),
        ).toEqual([]);
        expect(errors).toEqual([]);
        if (entry.path === "/" || entry.path === "/platform") {
          await page.screenshot({ path: testInfo.outputPath("public-page.png"), fullPage: true });
        }
      });
    }
  });
}

test("public navigation connects discovery, research, AI and the platform", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Explore markets/ })
    .click();
  await expect(page).toHaveURL(/\/markets$/);
  await page.getByRole("link", { name: "See the research process", exact: true }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("link", { name: "Meet the AI analyst", exact: true }).click();
  await expect(page).toHaveURL(/\/ai$/);
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Platform", exact: true })
    .click();
  await expect(page).toHaveURL(/\/platform$/);
  await expect(
    page.getByRole("link", { name: "Explore the Ripple map", exact: true }),
  ).toHaveAttribute("href", "/app/ripple");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(pages[4].title);
});

test("mobile menu contains its focus, closes with Escape and survives route changes and resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open menu", exact: true, includeHidden: true });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Explore Quant Plus" });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const close = dialog.getByRole("button", { name: "Close menu", exact: true });
  await expect(close).toBeFocused();
  await close.press("Shift+Tab");
  await expect(
    dialog.getByRole("link", { name: "Open paper terminal", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze()
      .then((r) => r.violations),
  ).resolves.toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole("link", { name: "Research", exact: true }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("main")).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

  await trigger.click();
  await expect(dialog.locator('[aria-current="page"]')).toHaveText("Research");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expectNoOverflow(page);
});

test("short landscape navigation remains scrollable and exposes the terminal entry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto("/markets");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const terminal = dialog.getByRole("link", { name: "Open paper terminal", exact: true });
  await terminal.focus();
  await expect(terminal).toBeInViewport();
  await terminal.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close menu" })).toBeFocused();
  await expectNoOverflow(page);
});

test("workspace preview supports arrow, Home, End and panel keyboard navigation", async ({
  page,
}) => {
  await page.goto("/platform");
  const tabs = page.getByRole("tablist", { name: "Workspace overview" });
  const portfolio = tabs.getByRole("tab", { name: "Portfolio", exact: true });
  await expect(portfolio).toBeEnabled();
  await portfolio.focus();
  await portfolio.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Markets", exact: true })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("Provider required");
  await page.keyboard.press("End");
  const research = tabs.getByRole("tab", { name: "Research", exact: true });
  await expect(research).toBeFocused();
  await expect(research).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Under evaluation");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel")).toBeFocused();
  await research.focus();
  await research.press("Home");
  await expect(portfolio).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("virtual deposits");
});

test("supplementary limitations and example prompts disclose with the keyboard, without running AI", async ({
  page,
}) => {
  await page.goto("/markets");
  const coverage = page
    .locator("details")
    .filter({ has: page.getByText("Market coverage and freshness", { exact: true }) });
  await expect(coverage).not.toHaveAttribute("open", "");
  await coverage.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(coverage).toHaveAttribute("open", "");
  await expect(coverage).toContainText("not a live quote");
  await page.keyboard.press("Space");
  await expect(coverage).not.toHaveAttribute("open", "");

  await page.goto("/ai");
  const prompts = page
    .locator("details")
    .filter({ has: page.getByText("Questions to try in the workspace", { exact: true }) });
  await prompts.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(prompts).toContainText("does not run a model");
  await expect(prompts.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Open AI workspace", exact: true })).toHaveAttribute(
    "href",
    "/app/quant-ai",
  );
});

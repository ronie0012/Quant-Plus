import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Every API call is intercepted before navigation. No workspace reads/writes,
// funding, provider/model requests or orders reach the isolated test server.
type LocalCall = {
  table?: string;
  operation?: string;
  rpc?: string;
  singular?: boolean;
  count?: boolean;
  values?: Record<string, unknown>;
};
const answers = {
  life_stage: "STUDENT",
  income: "NONE",
  emergency_fund: "NONE",
  horizon: "UNDER_1Y",
  experience: "OVER_3Y",
  drop_reaction: "BUY_MORE",
  drawdown_comfort: "30",
  goal: "TRADING",
};

async function fixture(page: Page, options: { newAccount?: boolean; profile?: boolean } = {}) {
  const preferences: Record<string, unknown> = {
    id: "learning-fixture",
    display_name: "Learner",
    density: "COMFORTABLE",
    calm_mode: true,
    learning: options.newAccount ? {} : { onboarding: "DONE" },
    ...(options.profile
      ? { investor_profile: { answers, completed_at: "2026-10-01T00:00:00.000Z" } }
      : {}),
  };
  const calls: LocalCall[] = [];
  const blocked: string[] = [];
  const errors: string[] = [];
  let failNextSave = false;
  let chatCalls = 0;
  let releaseChat: (() => void) | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4179") {
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    if (url.pathname === "/api/chat") {
      chatCalls++;
      await new Promise<void>((resolve) => {
        releaseChat = resolve;
      });
      await route
        .fulfill({ status: 503, json: { error: "Fixture tutor unavailable" } })
        .catch(() => undefined);
      return;
    }
    if (url.pathname !== "/api/local") {
      blocked.push(url.pathname);
      await route.fulfill({ status: 503, json: { error: "Unavailable in learning fixture" } });
      return;
    }
    const call = route.request().postDataJSON() as LocalCall;
    calls.push(call);
    if (call.rpc) {
      // Fail closed: no RPC is forwarded, especially wallet/trade operations.
      await route.fulfill({ json: [] });
      return;
    }
    const isPreferences = call.table === "trading_preferences";
    if (isPreferences && call.operation !== "select") {
      if (failNextSave) {
        failNextSave = false;
        await route.fulfill({ status: 503, body: "Fixture save failed" });
        return;
      }
      Object.assign(preferences, call.values);
    }
    const row = isPreferences
      ? preferences
      : call.table?.includes("account")
        ? {
            id: "learning-account",
            onboarded: !options.newAccount,
            cash: 0,
            available_cash: 0,
            reserved_cash: 0,
            settled_cash: 0,
            unsettled_cash: 0,
            initial_capital: 0,
            total_deposits: 0,
            total_withdrawals: 0,
          }
        : null;
    const rows = row ? [row] : [];
    await route.fulfill({
      json: call.singular
        ? row
        : call.count
          ? { rows, total: rows.length, offset: 0, limit: 50 }
          : rows,
    });
  });
  return {
    preferences,
    calls,
    blocked,
    errors,
    failSave: () => {
      failNextSave = true;
    },
    chatCalls: () => chatCalls,
    releaseChat: () => releaseChat?.(),
    assertNoTransactions: () => {
      expect(calls.filter((call) => call.rpc && /fund|order|trade|settle/.test(call.rpc))).toEqual(
        [],
      );
      expect(blocked.filter((path) => /paper|orders/.test(path))).toEqual([]);
      expect(errors).toEqual([]);
    },
  };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test("welcome traps focus, dismisses with Escape, resumes its draft and allows learning without funds", async ({
  page,
}) => {
  test.setTimeout(45_000); // Cold Vite transform plus the complete mobile welcome flow.
  await page.setViewportSize({ width: 375, height: 812 });
  const data = await fixture(page, { newAccount: true });
  await page.goto("/app/learn");
  const welcome = page.getByRole("dialog", { name: "Start with your Investor DNA" });
  await expect(welcome).toBeVisible({ timeout: 20_000 });
  const close = welcome.getByRole("button", { name: "Close welcome" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(welcome.getByRole("button", { name: /Skip questions/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await welcome.getByLabel("Student", { exact: true }).check();
  await welcome.getByRole("button", { name: "Next", exact: true }).click();
  await expect(welcome.getByRole("heading", { name: /Your yearly income/ })).toBeFocused();
  expect(await welcome.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(welcome).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const resume = page.getByRole("button", { name: "Getting started" });
  await resume.click();
  await expect(welcome.getByText("Question 2 of 8", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(resume).toBeFocused();
  await resume.click();
  await welcome.getByRole("button", { name: /Skip questions/ }).click();
  const path = page.getByRole("dialog", { name: "Your learning path is ready" });
  await expect(path).toBeVisible();
  await path.getByRole("button", { name: /Start with the basics/ }).click();
  await expect(page).toHaveURL(/\/app\/be-the-company$/);
  await expect(page.getByRole("button", { name: "Found the company" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await noOverflow(page);
  data.assertNoTransactions();
});

test("Investor DNA groups questions, retains a failed save, persists on retry and cancels a retake", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const data = await fixture(page);
  await page.goto("/app/investor-dna");
  const form = page.getByRole("form", { name: "Investor DNA questionnaire" });
  await expect(page.getByText(/completed answers are saved with your workspace/)).toBeVisible();
  await expect(form.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  const choices = [
    "Student",
    "No regular income",
    "I have no savings buffer",
    "Within a year",
    "More than 3 years",
    "Buy more while it is cheaper",
    "30% or more",
    "Practise active trading",
  ];
  for (let i = 0; i < choices.length; i++) {
    await expect(
      form.getByText(i < 4 ? "Part 1 · Capacity" : "Part 2 · Tolerance", { exact: true }),
    ).toBeVisible();
    await form.getByLabel(choices[i]!, { exact: true }).check();
    if (i === 0) {
      await form.getByLabel("Student", { exact: true }).focus();
      expect(
        await form
          .getByLabel("Student", { exact: true })
          .evaluate((el) => el.parentElement?.matches(":focus-within")),
      ).toBe(true);
      const audit = await new AxeBuilder({ page })
        .include('form[aria-label="Investor DNA questionnaire"]')
        .withTags(["wcag2a", "wcag2aa"])
        .disableRules(["color-contrast"])
        .analyze();
      expect(audit.violations).toEqual([]);
      await noOverflow(page);
    }
    if (i < choices.length - 1)
      await form.getByRole("button", { name: "Next", exact: true }).click();
  }
  data.failSave();
  await form.getByRole("button", { name: "See my DNA" }).click();
  await expect(form.getByRole("alert")).toContainText("Your draft is still here");
  await expect(form.getByLabel("Practise active trading")).toBeChecked();
  await form.getByRole("button", { name: "See my DNA" }).click();
  await expect(page.getByRole("heading", { name: /Profile saved/ })).toBeVisible();
  expect(data.preferences.investor_profile).toMatchObject({ answers });
  await expect(page.getByText("Cautious", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Aggressive", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Retake" }).click();
  await form.getByLabel("Retired", { exact: true }).check();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Profile saved/ })).toBeVisible();
  expect(data.preferences.investor_profile).toMatchObject({ answers });
  await page.getByRole("link", { name: "Start Be the Company" }).click();
  await expect(page.getByRole("button", { name: "Found the company" })).toBeVisible();
  await noOverflow(page);
  data.assertNoTransactions();
});

test("Learn recommends the next unfinished step and keeps optional practice behind disclosure", async ({
  page,
}) => {
  const data = await fixture(page, { profile: true });
  await page.goto("/app/learn");
  await expect(page.getByRole("heading", { name: "2. Be the Company" })).toBeVisible();
  await expect(page.getByText("Pick up where you left off", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Likely to rise", exact: true })).not.toBeVisible();
  await page.getByText("Optional daily practice · Ripple question", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Likely to rise", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Continue Be the Company", exact: true }).click();
  await expect(page.getByRole("button", { name: "Found the company" })).toBeVisible();
  data.assertNoTransactions();
});

test("company simulation resumes, explains disabled choices, protects restart and saves completion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const data = await fixture(page);
  await page.goto("/app/be-the-company");
  await page.getByLabel("Company name (optional)").fill("Fixture Chai");
  await page.getByRole("button", { name: "Found the company" }).click();
  await page.getByRole("button", { name: /Open the first stall/ }).click();
  await page.getByRole("button", { name: /Give 20%/ }).click();
  await expect(
    page.getByRole("heading", { name: "Quarter 1 of 4: run the business" }),
  ).toBeFocused();
  await expect(page.getByRole("button", { name: /Pay a dividend/ })).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Quarter 1 of 4: run the business" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("button", { name: "Keep playing" }).click();
  for (let q = 0; q < 4; q++)
    await page.getByRole("button", { name: /Keep things steady/ }).click();
  await expect(page.getByRole("heading", { name: "Your IPO", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Sell 10% new shares/ }).click();
  data.failSave();
  for (let q = 0; q < 4; q++)
    await page.getByRole("button", { name: /Keep things steady/ }).click();
  await expect(page.getByRole("heading", { name: "Your company's story" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Could not save completion");
  await page.getByRole("button", { name: "Retry saving completion" }).click();
  await expect(page.getByText("Licence step complete", { exact: true })).toBeVisible();
  await page.getByText("Review quarterly results · 8 quarters", { exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await noOverflow(page);
  await page.getByRole("link", { name: "Next: check your understanding" }).click();
  await expect(page.getByRole("heading", { name: "AI tutor", exact: true })).toBeVisible();
  data.assertNoTransactions();
});

test("Tutor starts with a check, stages AI help and rejects duplicate sends while busy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const data = await fixture(page);
  await page.goto("/app/tutor");
  await expect(
    page.getByRole("button", { name: "A small part of the company", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Your question", { exact: true })).not.toBeVisible();
  data.failSave();
  await page.getByRole("button", { name: "A small part of the company", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "A share is part-ownership" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Progress could not be saved");
  await expect(page.getByRole("button", { name: "Another question" })).toBeDisabled();
  await page.getByRole("button", { name: "Retry saving progress" }).click();
  await expect(page.getByRole("button", { name: "Another question" })).toBeEnabled();
  expect(data.preferences.learning).toMatchObject({ checks_answered: 1 });
  await page.getByRole("button", { name: "Another question" }).click();
  await expect(
    page.getByText("Why can a share price change during the day?", { exact: true }),
  ).toBeVisible();
  await page.getByText("Need help? Ask the AI tutor", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeDisabled();
  await page.getByLabel("Tutor language").selectOption("हिन्दी");
  await page.getByRole("button", { name: "Give me a real-life example", exact: true }).click();
  await expect(page.getByLabel("Your question", { exact: true })).toHaveValue(
    "Give me a real-life example",
  );
  expect(data.chatCalls()).toBe(0);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByLabel("Your question", { exact: true }).fill("A second question");
  await page.getByLabel("Your question", { exact: true }).press("Enter");
  expect(data.chatCalls()).toBe(1);
  await expect(page.getByLabel("Your question", { exact: true })).toHaveValue("A second question");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  data.releaseChat();
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeEnabled();
  await noOverflow(page);
  data.assertNoTransactions();
});

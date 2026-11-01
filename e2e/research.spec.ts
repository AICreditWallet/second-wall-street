import { expect, test } from "@playwright/test";

test.describe("Open15 research and agent workflows (public)", () => {
  test("research page shows ranked candidates with a simulated-data notice", async ({ page }) => {
    await page.goto("/research");
    await expect(page.getByRole("heading", { level: 1, name: /What stood out at the open/ })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Simulated data");
    const cards = page.getByRole("heading", { name: "Ranked unusual activity" }).locator("..").getByRole("listitem").filter({ has: page.getByRole("img") });
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
    await expect(page.getByText("not investment advice", { exact: false }).first()).toBeVisible();
  });

  test("back-tests are labelled hypothetical and out-of-sample", async ({ page }) => {
    await page.goto("/research/backtests");
    await expect(page.getByText("Hypothetical results.", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Out-of-sample results/ })).toBeVisible();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(7);
  });

  test("a platform run shows every agent step, the approval gate and the event log", async ({ page }) => {
    await page.goto("/workflows");
    await expect(page.getByRole("heading", { level: 1, name: "Watch the agents work together" })).toBeVisible();
    await page.getByRole("link", { name: /Multi-agent research firm.*Platform run/ }).first().click();
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    for (const name of ["Opening Session Scanner", "Risk Analyst", "Human approval", "Report Agent"]) {
      await expect(page.getByRole("heading", { level: 3, name })).toBeVisible();
    }
    await expect(page.getByText(/Approved by platform policy/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Event log" })).toBeVisible();
    await expect(page.getByText("run.succeeded")).toBeVisible();
    // Visitors can't approve or cancel anything.
    await expect(page.getByRole("button", { name: /Approve|Cancel/ })).toHaveCount(0);
  });

  test("starting a private run requires signing in", async ({ page }) => {
    await page.goto("/workflows");
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }).first()).toHaveAttribute("href", "/sign-in?next=/workflows");
  });

  test("unknown or malformed run ids are 404s", async ({ page }) => {
    expect((await page.goto("/workflows/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
    expect((await page.goto("/workflows/%3Cscript%3E"))?.status()).toBe(404);
  });

  test("the city lists real agent activity with links to the runs", async ({ page }) => {
    await page.goto("/city");
    const card = page.getByRole("region", { name: /Agent activity/ });
    await expect(card).toBeVisible();
    if ((await card.getByRole("button", { name: /Agent activity/ }).getAttribute("aria-expanded")) === "false") await card.getByRole("button", { name: /Agent activity/ }).click();
    await expect(card.getByText("Open15 AI")).toBeVisible();
    await expect(card.getByRole("link", { name: "Watch the run" }).first()).toHaveAttribute("href", /^\/workflows\//);
  });
});

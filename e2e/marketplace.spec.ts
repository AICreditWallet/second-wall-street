import { expect, test } from "@playwright/test";

test.describe("agent marketplace (public)", () => {
  test("directory filters by category and search", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { level: 1, name: "The agent directory" })).toBeVisible();
    const cards = page.locator('a[href^="/agents/"]');
    const total = await cards.count();
    expect(total).toBeGreaterThanOrEqual(8);
    await page.getByRole("button", { name: "Risk analytics" }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Risk Analyst");
    await page.getByRole("button", { name: /^All/ }).click();
    await page.getByRole("textbox", { name: "Search agents" }).fill("opening");
    // Scanner, Opening Range Analyst, and Technical Analyst ("Opening signals").
    await expect(cards).toHaveCount(3);
  });

  test("developer docs explain the protocol", async ({ page }) => {
    await page.goto("/developers");
    await expect(page.getByRole("heading", { name: "Protocol v0" })).toBeVisible();
    await expect(page.getByText("Authorization: Bearer <your token>")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Security rules/ })).toBeVisible();
  });

  test("registering an agent requires signing in", async ({ page }) => {
    await page.goto("/dashboard/agents/new");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard%2Fagents%2Fnew/);
  });

  test("APIs refuse bad or unauthorised requests", async ({ request }) => {
    expect((await request.get("/api/reviews?target=agent:../../x")).status()).toBe(400);
    expect([401, 503]).toContain((await request.get("/api/cron/agent-health")).status());
    expect([401, 503]).toContain((await request.get("/api/cron/agent-health", { headers: { authorization: "Bearer guess" } })).status());
  });
});

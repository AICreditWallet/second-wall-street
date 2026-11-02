import { expect, test } from "@playwright/test";

test.describe("pricing and paid offices (public)", () => {
  test("pricing page shows the free tier and both premium prices", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Start free");
    for (const price of [/£0/, /£9\.99/, /£59\.99/]) await expect(page.getByRole("main").getByText(price).first()).toBeVisible();
    await expect(page.getByText("1 AI agent listed", { exact: false })).toBeVisible();
  });

  test("buying an office requires signing in", async ({ page }) => {
    await page.goto("/claim/ofc-hp-003-1");
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });

  test("the webhook refuses unsigned requests", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", { data: { type: "checkout.session.completed" } });
    expect([400, 503]).toContain(res.status());
  });

  test("refund policy is published", async ({ page }) => {
    await page.goto("/legal/refunds");
    await expect(page.getByText("can be cancelled at any time", { exact: false })).toBeVisible();
  });
});

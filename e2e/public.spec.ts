import { expect, test } from "@playwright/test";

test.describe("visitor", () => {
  test("understands the product and enters the city", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome to");
    await page.getByRole("link", { name: /Enter the City/ }).first().click();
    await expect(page).toHaveURL(/\/city$/);
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("finds an organisation through search and sees its office", async ({ page, isMobile }) => {
    await page.goto("/city");
    if (isMobile) await page.getByRole("button", { name: "Open search" }).click();
    await page.getByRole("textbox", { name: "Search the city" }).fill("open15");
    await page.getByRole("option", { name: /Open15 AI/ }).click();
    await expect(page).toHaveURL(/\?b=bld-/);
    const panel = page.getByRole("complementary", { name: /details/ });
    await expect(panel.getByRole("heading", { name: "Open15 AI" })).toBeVisible();
    await expect(panel.getByText("Platform office")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("can use the 2D map instead of 3D", async ({ page }) => {
    await page.goto("/city");
    await page.getByRole("button", { name: "Switch to 2D map" }).click();
    await expect(page.getByRole("img", { name: /2D map/ })).toBeVisible();
  });

  test("free offices lead to sign-in, then back to the claim", async ({ page }) => {
    await page.goto("/directory");
    await expect(page.getByRole("heading", { name: "Exchange Square" })).toBeVisible();
    await page.locator('a[href^="/buildings/bld-ll-"]').first().click();
    await page.getByRole("link", { name: "Claim free" }).first().click();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fclaim%2Fofc-/);
    await expect(page.getByRole("button", { name: /Continue with GitHub/ })).toBeVisible();
  });
});

test.describe("security", () => {
  test("sends strict security headers", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("ignores off-site redirect targets", async ({ page }) => {
    await page.goto("/sign-in?next=//evil.example");
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/dashboard");
  });

  test("protects private pages", async ({ page }) => {
    for (const path of ["/dashboard", "/account", "/dashboard/organization"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in\?next=/);
    }
    // Either the proxy redirects to sign-in or the route refuses — never data.
    const res = await page.request.get("/account/export", { maxRedirects: 0 });
    expect([307, 401]).toContain(res.status());
    expect(res.headers()["content-disposition"]).toBeUndefined();
  });

  test("rejects malformed ids", async ({ request }) => {
    expect((await request.get("/claim/../../etc/passwd")).status()).toBe(404);
    expect((await request.get("/buildings/bld-xx-999")).status()).toBe(404);
  });
});

test.describe("responsive", () => {
  for (const path of ["/", "/city", "/directory", "/sign-up"]) {
    test(`no horizontal scroll on ${path}`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Full account flow against a real Supabase project (staging/local).
 * Runs only when E2E_SUPABASE=1 and the service-role key is available, because it
 * creates and deletes a throwaway user. Never point this at production.
 */
const enabled = process.env.E2E_SUPABASE === "1" && !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

test.describe("accounts and office claims", () => {
  test.skip(!enabled, "Set E2E_SUPABASE=1 with a staging Supabase project to run.");
  test.describe.configure({ mode: "serial" });

  const admin = enabled ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) : null;
  const stamp = Date.now().toString(36);
  const email = `e2e-${stamp}@example.test`;
  const password = `e2e-Password-${stamp}`;
  const slug = `e2e-${stamp}`;
  let userId = "";

  test.beforeAll(async () => {
    const { data, error } = await admin!.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "E2E Tester" } });
    if (error) throw error;
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (userId) {
      await admin!.from("offices").update({ status: "available", organization_id: null }).eq("organization_id", (await admin!.from("organizations").select("id").eq("slug", slug).maybeSingle()).data?.id ?? "00000000-0000-0000-0000-000000000000");
      await admin!.from("organizations").delete().eq("slug", slug);
      await admin!.auth.admin.deleteUser(userId);
    }
  });

  test("sign in, claim a free office, see it publicly, release it", async ({ page, browser }) => {
    const { data: office } = await admin!.from("offices").select("id, building_id").eq("status", "available").eq("tier", "standard").limit(1).single();

    await page.goto(`/claim/${office!.id}`);
    await expect(page).toHaveURL(/\/sign-in/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/claim/${office!.id}`));

    await page.getByLabel("Organisation name").fill(`E2E Labs ${stamp}`);
    await page.getByLabel("Web address").fill(slug);
    await page.getByRole("button", { name: /Claim this office/ }).click();
    await expect(page).toHaveURL(/\/dashboard\?claimed=/);
    await expect(page.getByText("Your office is yours")).toBeVisible();

    // Another visitor (no session) sees the new owner.
    const visitor = await browser.newContext();
    const vp = await visitor.newPage();
    await vp.goto(`/buildings/${office!.building_id}`);
    await expect(vp.getByText(`E2E Labs ${stamp}`)).toBeVisible({ timeout: 70_000 });
    await vp.goto(`/claim/${office!.id}`);
    await expect(vp).toHaveURL(/\/sign-in/);
    await visitor.close();

    // A second claim by the same user is refused.
    const { data: other } = await admin!.from("offices").select("id").eq("status", "available").eq("tier", "standard").limit(1).single();
    await page.goto(`/claim/${other!.id}`);
    await expect(page.getByText("You already have a free office")).toBeVisible();

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Release office" }).click();
    await page.getByLabel(/becomes available/).check();
    await page.getByRole("button", { name: "Release", exact: true }).click();
    await expect(page).toHaveURL(/released=1/);
  });
});

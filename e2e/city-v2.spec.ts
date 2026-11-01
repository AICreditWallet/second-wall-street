import { expect, test, type Page } from "@playwright/test";

/** Average brightness (0–255) of the scene area, excluding the side panel. */
async function sceneBrightness(page: Page) {
  const size = page.viewportSize()!;
  const shot = await page.screenshot({ clip: { x: 0, y: size.height * 0.25, width: size.width * 0.5, height: size.height * 0.4 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
    return sum / (d.length / 4);
  }, shot.toString("base64"));
}

async function waitForCity(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("status").filter({ hasText: "Lighting up the district" })).toBeHidden({ timeout: 45_000 });
}

async function expectNotWhite(page: Page) {
  await expect(page.getByTestId("graphics-problem")).toHaveCount(0);
  // A lost WebGL canvas renders near-white (~240+); the city at night is dark.
  expect(await sceneBrightness(page)).toBeLessThan(170);
}

test.describe("white-screen regression", () => {
  test.setTimeout(150_000);

  test("selecting, closing and switching buildings never blanks the city", async ({ page, isMobile }) => {
    await page.goto("/city");
    await waitForCity(page);
    const ids = ["bld-ex-010", "bld-ex-005", "bld-hp-039", "bld-ll-001", "bld-ex-010", "bld-sh-004"];
    for (const id of ids) {
      await page.evaluate((b) => {
        const url = new URL(location.href);
        url.searchParams.set("b", b);
        history.pushState(null, "", url);
        dispatchEvent(new PopStateEvent("popstate"));
      }, id);
      await expect(page.getByTestId("details-panel")).toBeVisible();
      await page.waitForTimeout(1500);
      await expectNotWhite(page);
      if (!isMobile) {
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("details-panel")).toBeHidden();
      }
    }
    expect(await page.locator("canvas").count()).toBe(1);
  });

  test("direct building link and refresh keep the city visible", async ({ page }) => {
    await page.goto("/city?b=bld-ex-010");
    await waitForCity(page);
    await expect(page.getByRole("heading", { name: "Second Street Research Lab" })).toBeVisible();
    await page.waitForTimeout(1500);
    await expectNotWhite(page);
    await page.reload();
    await waitForCity(page);
    await expect(page.getByRole("heading", { name: "Second Street Research Lab" })).toBeVisible();
    await expectNotWhite(page);
  });

  test("a lost GPU context shows a recovery screen, not a white page", async ({ page }) => {
    await page.goto("/city?b=bld-ex-005");
    await waitForCity(page);
    await page.evaluate(() => (document.querySelector("canvas")!.getContext("webgl2") as WebGL2RenderingContext).getExtension("WEBGL_lose_context")!.loseContext());
    await expect(page.getByTestId("graphics-problem")).toContainText("paused");
    await page.getByRole("button", { name: "Restart 3D view" }).click();
    await waitForCity(page);
    await expect(page.getByTestId("graphics-problem")).toHaveCount(0);
  });
});

test.describe("building → lobby → office → agent journey", () => {
  test.setTimeout(150_000);

  test("visitor walks into the research lab and inspects an agent", async ({ page }) => {
    await page.goto("/city?b=bld-ex-010");
    await waitForCity(page);
    await page.getByRole("button", { name: "Enter building" }).click();
    await expect(page).toHaveURL(/view=lobby/);
    await expect(page.getByRole("heading", { name: "Research Lab Building" })).toBeVisible();

    await page.getByRole("button", { name: "Visit Floors 22–27" }).click();
    await expect(page).toHaveURL(/office=ofc-ex-010-/);
    await expect(page.getByText("Financial Research Firm")).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("graphics-problem")).toHaveCount(0);

    await page.getByRole("button", { name: /Technical Analyst/ }).click();
    await expect(page.getByRole("heading", { name: "Technical Analyst" })).toBeVisible();
    await expect(page.getByText("Preview listing")).toBeVisible();
    await expect(page.getByRole("link", { name: /Agent profile/ })).toHaveAttribute("href", "/agents/lab-technical-analyst");

    // Back out with the browser's back button, then the in-app back control.
    await page.goBack();
    await expect(page).toHaveURL(/view=lobby/);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/view=building/);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).not.toHaveURL(/view=/);
    await page.waitForTimeout(1500);
    await expectNotWhite(page);
    expect(await page.locator("canvas").count()).toBe(1);
  });

  test("free offices can be previewed and lead to claiming", async ({ page }) => {
    await page.goto("/city?b=bld-ll-001&view=lobby");
    await waitForCity(page);
    await page.getByRole("button", { name: /^Visit Floor/ }).first().click();
    await expect(page.getByRole("link", { name: /Claim this office/ })).toHaveAttribute("href", /\/claim\/ofc-ll-001-/);
  });

  test("agent profile pages exist", async ({ page }) => {
    await page.goto("/agents/lab-technical-analyst");
    await expect(page.getByRole("heading", { level: 1, name: "Technical Analyst" })).toBeVisible();
    await expect(page.getByRole("link", { name: "See its workstation in 3D" })).toHaveAttribute("href", /office=/);
  });
});

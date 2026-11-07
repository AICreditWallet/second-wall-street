import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Set E2E_BASE_URL to run the (read-only) suite against a deployed site instead of a local build.
const REMOTE = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // 3D scenes are heavy in software rendering; too many browsers at once time out.
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: REMOTE ?? `http://localhost:${PORT}`,
    // Uses the installed Google Chrome (the bundled Chromium doesn't support macOS 13).
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: REMOTE
    ? undefined
    : {
    // Run against a production build: `npm run build` first.
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

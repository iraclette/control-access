import { defineConfig, devices } from "@playwright/test";

// Local runs read the keys from .env.local; CI exports them from `supabase status`.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local (CI)
}

const PORT = Number(process.env.E2E_PORT ?? 3000);

// Browser tests against a running site + local Supabase (seeded with supabase/seed.sql).
// They change shared demo data and put it back, so they run one at a time.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 1000 } } }],
  webServer: {
    // CI builds first and serves the production build; locally an already running `npm run dev` is reused.
    command: process.env.CI ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

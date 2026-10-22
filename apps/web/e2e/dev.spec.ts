import { expect, test } from "@playwright/test";
import { DEV, STAFF, backendUp, signIn, tokenFor } from "./helpers";

test.describe("developer console", () => {
  test("regular staff don't get it", async ({ page }) => {
    await signIn(page, STAFF);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Developer", exact: true })).toHaveCount(0);
    await page.goto("/en/staff/dev");
    await expect(page.getByText("Developer access only.")).toBeVisible();
  });

  test("the relay only forwards known read-only endpoints, with a token", async ({ request }) => {
    expect((await request.get("/api/dev/overview")).status()).toBe(401);
    const token = await tokenFor(DEV);
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request.get("/api/dev/admin/flats", { headers: auth })).status()).toBe(404);
    expect((await request.get("/api/dev/firmware/upload", { headers: auth })).status()).toBe(404);
  });

  test.describe("with the access backend running", () => {
    test.beforeEach(async () => {
      test.skip(!(await backendUp()), "access backend not running (CI starts it)");
    });

    test("the backend refuses a staff token", async ({ request }) => {
      const res = await request.get("/api/dev/devices", { headers: { Authorization: `Bearer ${await tokenFor(STAFF)}` } });
      expect(res.status()).toBe(403);
    });

    test("the developer sees controllers, firmware and pending updates", async ({ page }) => {
      await signIn(page, DEV);
      await page.getByRole("link", { name: "Developer", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Developer console" })).toBeVisible();

      // Seeded like the real building (backend/scripts/seed_local.py): 2 doors, 2 elevators, enroller.
      const rows = page.locator("section", { hasText: "Controllers" }).locator("tbody tr");
      await expect(rows).toHaveCount(5);
      await expect(page.getByText("will update to 1.0.12")).toHaveCount(1);
      await expect(page.locator("section", { hasText: "Firmware releases" }).getByText("active")).toHaveCount(2);
      await expect(page.getByText("153", { exact: true })).toBeVisible();

      // Nothing secret reaches the page.
      const html = await page.content();
      expect(html).not.toContain("local-device-secret");
      expect(html).not.toMatch(/"(secret|pin_hash|hash|content)"/);
    });
  });
});

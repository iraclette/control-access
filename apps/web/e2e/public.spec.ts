import { expect, test } from "@playwright/test";
import { admin } from "./helpers";

test.describe("public website", () => {
  test("every page loads in every language", async ({ page }) => {
    for (const path of ["", "/projects", "/projects/gori-residence-2", "/flats", "/contact"]) {
      for (const lang of ["ka", "en", "ru"]) {
        const res = await page.goto(`/${lang}${path}`);
        expect(res?.status(), `/${lang}${path}`).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
      }
    }
  });

  test("unknown pages get the translated 404", async ({ page }) => {
    const res = await page.goto("/en/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("the building view links every flat and shows its card", async ({ page }) => {
    await page.goto("/en/projects/gori-residence-2");
    const regions = page.locator("a.hotspot");
    await expect(regions).toHaveCount(24); // front view: 12 floors × 2 flats
    const first = regions.first();
    await expect(first).toHaveAttribute("aria-label", /^Flat \d+, floor \d+, \d rooms, [\d.,]+\sm², (Available|Reserved|Sold)$/);

    await first.hover();
    await expect(page.locator("aside").getByRole("link", { name: "View flat" })).toBeVisible();

    await page.getByRole("tab", { name: "Side" }).click();
    await expect(regions).toHaveCount(24);

    // Keyboard: focus a region and press Enter to open the flat.
    await regions.first().focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/flats\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: /^Flat \d+$/ })).toBeVisible();
  });

  test("filters narrow the flat list through the URL", async ({ page }) => {
    await page.goto("/en/flats?rooms=4&project=varketili-residence");
    const cards = page.locator('a[href^="/flats/"]');
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(cards.nth(i)).toContainText("Varketili Residence");
      await expect(cards.nth(i)).toContainText("Available");
    }
    await expect(page.getByText(`${n} flats found`)).toBeVisible();
  });

  test("the contact form saves a lead", async ({ page }) => {
    const name = `E2E visitor ${Date.now()}`;
    await page.goto("/en/contact");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Phone").fill("+995 555 00 00 00");
    await page.getByLabel("Message (optional)").fill("Interested in a 2-room flat.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Thank you! We'll get back to you soon.")).toBeVisible();

    const { data } = await admin.from("leads").select("id, locale").eq("name", name).single();
    expect(data?.locale).toBe("en");
    await admin.from("leads").delete().eq("id", data!.id);
  });

  test("the language switcher remembers the choice", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("group", { name: "Language" }).first().getByRole("button", { name: "ქარ" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ka");
    await page.goto("/projects");
    await expect(page.locator("html")).toHaveAttribute("lang", "ka");
  });
});

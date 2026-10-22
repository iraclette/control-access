import { expect, test, type Page } from "@playwright/test";
import { OUTSIDER, STAFF, admin, flatByNumber, projectBySlug, signIn } from "./helpers";

type Point = [number, number];

test.describe("staff console", () => {
  test("an account without a staff role gets no console", async ({ page }) => {
    await signIn(page, OUTSIDER);
    await expect(page.getByText("This account has no access to the staff console.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Flats & prices" })).toHaveCount(0);
  });

  test.describe("signed in as staff", () => {
    test.beforeEach(async ({ page }) => {
      await signIn(page, STAFF);
      await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    });

    test("changing a flat's status saves it", async ({ page }) => {
      const { id: projectId, buildingId } = await projectBySlug("gori-residence-2");
      const flat = await flatByNumber(buildingId, "1");
      const target = flat.status === "reserved" ? "available" : "reserved";

      await page.goto(`/en/staff/flats?project=${projectId}`);
      const card = page.locator("li", { has: page.locator("p.font-semibold", { hasText: /^Flat 1$/ }) });
      await card.getByRole("radio", { name: target === "reserved" ? "Reserved" : "Available" }).click();
      await expect(card.getByText("Saved")).toBeVisible();
      expect((await flatByNumber(buildingId, "1")).status).toBe(target);

      await admin.from("flats").update({ status: flat.status }).eq("id", flat.id);
    });

    test("the region editor draws, pastes and adjusts regions", async ({ page }) => {
      const { buildingId } = await projectBySlug("gori-residence-2");
      const { data: view } = await admin.from("views").select("id").eq("building_id", buildingId).eq("kind", "front").single();
      const flat1 = await flatByNumber(buildingId, "1");
      const flat5 = await flatByNumber(buildingId, "5"); // directly above flat 1
      const pointsOf = async (flatId: string) =>
        ((await admin.from("hotspots").select("points").eq("view_id", view!.id).eq("flat_id", flatId).maybeSingle()).data?.points ?? null) as Point[] | null;
      const original1 = (await pointsOf(flat1.id))!;
      const original5 = (await pointsOf(flat5.id))!;

      try {
        await page.goto(`/en/staff/views/${view!.id}`);
        const surface = page.locator("div.touch-none");
        await expect(surface).toBeVisible();
        const box = (await surface.boundingBox())!;
        const at = ([x, y]: Point) => ({ x: box.x + x * box.width, y: box.y + y * box.height });
        const status = page.getByRole("status").filter({ hasText: /Saved|Saving/ }).first();

        // Redraw flat 1 point by point; clicking near the first point closes the shape.
        await page.getByRole("button", { name: /^Flat 1 · 1/ }).click();
        await page.getByRole("button", { name: "Remove region" }).click();
        await expect(status).toHaveText("Saved");
        expect(await pointsOf(flat1.id)).toBeNull();
        await page.getByRole("button", { name: "Draw" }).click();
        for (const p of original1) await page.mouse.click(at(p).x, at(p).y);
        await page.mouse.click(at(original1[0]).x + 3, at(original1[0]).y + 2);
        await expect.poll(() => pointsOf(flat1.id)).not.toBeNull();
        expectNear((await pointsOf(flat1.id))!, original1, 0.003);

        // Paste onto flat 5: it should land exactly on the floor above (measured spacing).
        await page.getByRole("button", { name: /^Flat 5 · 2/ }).click();
        await page.getByRole("button", { name: "Remove region" }).click();
        await expect.poll(() => pointsOf(flat5.id)).toBeNull();
        await cancelDrawing(page);
        await page.getByRole("button", { name: "Paste last shape" }).click();
        await expect.poll(() => pointsOf(flat5.id)).not.toBeNull();
        expectNear((await pointsOf(flat5.id))!, original5, 0.002);

        // Drag one corner 30px right.
        const before = (await pointsOf(flat5.id))!;
        const handle = at(before[1]);
        await page.mouse.move(handle.x, handle.y);
        await page.mouse.down();
        await page.mouse.move(handle.x + 30, handle.y, { steps: 5 });
        await page.mouse.up();
        await expect.poll(async () => ((await pointsOf(flat5.id))![1][0] - before[1][0]) * box.width).toBeCloseTo(30, 0);
      } finally {
        await admin.from("hotspots").upsert(
          [
            { view_id: view!.id, flat_id: flat1.id, points: original1 },
            { view_id: view!.id, flat_id: flat5.id, points: original5 },
          ],
          { onConflict: "view_id,flat_id" },
        );
      }
    });

    test("building images upload and delete", async ({ page }) => {
      const { id: projectId, buildingId } = await projectBySlug("gori-residence-2");
      await page.goto(`/en/staff/views?project=${projectId}`);
      await page.getByLabel("Type").selectOption("back");
      await page.getByLabel("Image file").setInputFiles("public/demo/gori-residence-2-side.svg");
      await page.getByRole("button", { name: "Upload" }).click();

      const backCard = page.locator("li", { has: page.locator("p.font-medium", { hasText: /^Back$/ }) });
      await expect(backCard).toBeVisible();
      const { data: back } = await admin.from("views").select("id, image_path, image_width").eq("building_id", buildingId).eq("kind", "back").single();
      expect(back?.image_path).toMatch(/^views\/.+\.svg$/);
      expect(back?.image_width).toBe(1600);

      page.once("dialog", (d) => d.accept());
      await backCard.getByRole("button", { name: "Delete" }).click();
      await expect(backCard).toHaveCount(0);
      expect((await admin.from("views").select("id").eq("kind", "back")).data).toEqual([]);
    });

    test("requests show contact buttons and save status", async ({ page }) => {
      const { data: lead } = await admin.from("leads").insert({ name: "E2E lead", phone: "+995555111111", message: "Call me" }).select("id").single();
      try {
        await page.goto("/en/staff/leads");
        const item = page.locator("li", { hasText: "E2E lead" });
        await expect(item.getByRole("link", { name: /\+995555111111/ })).toHaveAttribute("href", "tel:+995555111111");
        await item.getByRole("combobox").selectOption("contacted");
        await expect.poll(async () => (await admin.from("leads").select("status").eq("id", lead!.id).single()).data?.status).toBe("contacted");
      } finally {
        await admin.from("leads").delete().eq("id", lead!.id);
      }
    });
  });
});

async function cancelDrawing(page: Page) {
  const cancel = page.getByRole("button", { name: "Cancel" });
  if (await cancel.isVisible()) await cancel.click();
}

function expectNear(actual: Point[], expected: Point[], tolerance: number) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach(([x, y], i) => {
    expect(Math.abs(x - expected[i][0])).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(y - expected[i][1])).toBeLessThanOrEqual(tolerance);
  });
}

import { expect, test } from "@playwright/test";
import { STAFF, admin, signIn } from "./helpers";

const SLUG = "e2e-test-tower";

async function flatsOf(projectId: string, buildingIndex: number) {
  const { data: buildings } = await admin.from("buildings").select("id").eq("project_id", projectId).order("sort_order");
  const { data } = await admin
    .from("flats")
    .select("number, floor, rooms, area_m2")
    .eq("building_id", buildings![buildingIndex].id);
  return (data ?? []).sort((a, b) => Number(a.number) - Number(b.number));
}

test.describe("creating projects and flats", () => {
  test.beforeEach(async ({ page }) => {
    await admin.from("projects").delete().eq("slug", SLUG);
    await signIn(page, STAFF);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });
  test.afterEach(async () => {
    await admin.from("projects").delete().eq("slug", SLUG);
  });

  test("from a new project to flats, then delete it all", async ({ page }) => {
    page.on("dialog", (d) => d.accept());

    // New project: a taken address is refused, the address follows the name.
    await page.goto("/en/staff/projects");
    await page.getByRole("button", { name: "+ New project" }).click();
    const form = page.locator("form", { has: page.getByRole("heading", { name: "New project" }) });
    await form.locator('input[lang="en"]').first().fill("Gori Residence 1");
    await form.getByRole("button", { name: "Create project" }).click();
    await expect(form.getByText("already used by another project")).toBeVisible();

    await form.locator('input[lang="en"]').first().fill("E2E Test Tower");
    await expect(form.locator("input.font-mono")).toHaveValue(SLUG);
    await form.locator('input[type="number"]').fill("3");
    await form.getByRole("button", { name: "Create project" }).click();
    // The form closes once the project and its first building are both saved.
    await expect(form).toHaveCount(0);
    await expect(page.getByLabel("Project", { exact: true })).toHaveValue(/.+/);

    const { data: project } = await admin.from("projects").select("id, published, buildings(floors)").eq("slug", SLUG).single();
    expect(project?.published).toBe(false);
    expect(project?.buildings).toEqual([{ floors: 3 }]);
    const projectId = project!.id as string;

    // Second building.
    await page.getByRole("button", { name: "Add building" }).click();
    const bform = page.locator("form", { has: page.getByRole("button", { name: "Add building" }) });
    await bform.locator('input[lang="en"]').fill("Building B");
    await bform.locator('input[type="number"]').fill("2");
    await bform.getByRole("button", { name: "Add building" }).click();
    await expect.poll(async () => (await admin.from("buildings").select("id").eq("project_id", projectId)).data?.length).toBe(2);

    // Floor-by-floor: two flats per floor on floors 1–3, numbered in order.
    await page.goto(`/en/staff/flats?project=${projectId}`);
    await page.getByRole("button", { name: "Add flats floor by floor" }).click();
    await page.getByRole("button", { name: "+ Add a flat to the floor" }).click();
    const layout = page.locator("fieldset", { has: page.getByText("Flats on each floor") });
    await layout.locator('input[inputmode="numeric"]').nth(1).fill("3");
    await layout.locator('input[inputmode="decimal"]').nth(1).fill("90");
    await expect(page.getByText("6 flats will be added, numbers 1–6")).toBeVisible();
    await page.getByRole("button", { name: "Add flats", exact: true }).click();
    await expect(page.getByText("6 flats added")).toBeVisible();
    expect((await flatsOf(projectId, 0)).at(-1)).toEqual({ number: "6", floor: 3, rooms: 3, area_m2: 90 });

    // Building B by floor up to floor 4 (taller than recorded: the building grows).
    await page.getByLabel("Building", { exact: true }).selectOption({ label: "Building B" });
    await page.getByLabel("By floor (101, 102… 201…)").check();
    await page.getByLabel("To floor").fill("4");
    await expect(page.getByText("8 flats will be added, numbers 101–402")).toBeVisible();
    await page.getByRole("button", { name: "Add flats", exact: true }).click();
    await expect(page.getByText("8 flats added")).toBeVisible();
    expect((await flatsOf(projectId, 1)).map((f) => f.number)).toEqual(["101", "102", "201", "202", "301", "302", "401", "402"]);
    expect((await admin.from("buildings").select("floors").eq("project_id", projectId).eq("sort_order", 1).single()).data?.floors).toBe(4);

    // One flat at a time: an existing number is refused, a new one goes in.
    await page.getByRole("button", { name: "Add a flat", exact: true }).click();
    const one = page.locator("form", { has: page.getByRole("button", { name: "Add a flat", exact: true }) }).last();
    const [number, floor, rooms, area] = [0, 1, 2, 3].map((i) => one.locator("input").nth(i));
    await number.fill("101");
    await floor.fill("1");
    await rooms.fill("2");
    await area.fill("55");
    await one.getByRole("button", { name: "Add a flat" }).click();
    await expect(page.getByText("Flat number 101 already exists in this building.")).toBeVisible();
    await number.fill("103");
    await one.getByRole("button", { name: "Add a flat" }).click();
    await expect(page.getByText("1 flats added")).toBeVisible();

    // Edit, then delete that flat.
    const card = page.locator("li", { has: page.locator("p.font-semibold", { hasText: /^Flat 103/ }) });
    await card.getByRole("button", { name: "Edit details" }).click();
    await card.locator('input[name="area"]').fill("57.5");
    await card.getByRole("button", { name: "Save" }).click();
    await expect.poll(async () => (await flatsOf(projectId, 1)).find((f) => f.number === "103")?.area_m2).toBe(57.5);
    await card.getByRole("button", { name: "Edit details" }).click();
    await card.getByRole("button", { name: "Delete" }).click();
    await expect.poll(async () => (await flatsOf(projectId, 1)).some((f) => f.number === "103")).toBe(false);

    // Still unpublished: not on the public site.
    expect((await page.goto(`/en/projects/${SLUG}`))?.status()).toBe(404);

    // Deleting the project removes everything under it.
    await page.goto(`/en/staff/projects?project=${projectId}`);
    await page.getByRole("button", { name: "Delete project" }).click();
    await expect.poll(async () => (await admin.from("projects").select("id").eq("slug", SLUG)).data?.length).toBe(0);
    expect((await admin.from("buildings").select("id").eq("project_id", projectId)).data).toEqual([]);
  });
});

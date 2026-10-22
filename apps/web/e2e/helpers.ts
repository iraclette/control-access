import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Service-role client for setting up and checking data behind the UI's back.
export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  db: { schema: "site" },
  auth: { persistSession: false },
});

export const STAFF = { email: "e2e-staff@test.local", password: () => process.env.E2E_STAFF_PASSWORD! };
export const OUTSIDER = { email: "e2e-outsider@test.local", password: () => process.env.E2E_OUTSIDER_PASSWORD! };

export async function signIn(page: Page, who: { email: string; password: () => string }) {
  await page.goto("/en/staff");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password());
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function projectBySlug(slug: string) {
  const { data } = await admin.from("projects").select("id, buildings(id)").eq("slug", slug).single();
  expect(data, `seed project ${slug}`).toBeTruthy();
  return { id: data!.id as string, buildingId: (data!.buildings as { id: string }[])[0].id };
}

export async function flatByNumber(buildingId: string, number: string) {
  const { data } = await admin.from("flats").select("id, status, floor").eq("building_id", buildingId).eq("number", number).single();
  return data as { id: string; status: string; floor: number };
}

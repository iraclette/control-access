import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Creates (or resets) the two test accounts with fresh random passwords for this run:
// a staff member, and a signed-in account with no staff role. Values set on process.env
// here are visible to the tests.
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (local Supabase).");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
    throw new Error(`Refusing to run e2e tests against ${url}: they change data. Use the local Supabase.`);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  async function ensure(email: string, role: "staff" | null) {
    const password = randomBytes(12).toString("base64url");
    const existing = list?.users.find((u) => u.email === email);
    const id = existing
      ? (await supabase.auth.admin.updateUserById(existing.id, { password })).data.user!.id
      : (await supabase.auth.admin.createUser({ email, password, email_confirm: true })).data.user!.id;
    if (role) await supabase.schema("site").from("staff").upsert({ user_id: id, role });
    else await supabase.schema("site").from("staff").delete().eq("user_id", id);
    return password;
  }

  process.env.E2E_STAFF_PASSWORD = await ensure("e2e-staff@test.local", "staff");
  process.env.E2E_OUTSIDER_PASSWORD = await ensure("e2e-outsider@test.local", null);
}

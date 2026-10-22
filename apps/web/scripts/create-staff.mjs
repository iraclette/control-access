// Creates (or updates) a staff account for the staff console.
//
//   node --env-file=.env.local scripts/create-staff.mjs <email> <role: staff|dev> [display name]
//
// Prints a generated password once. Uses the service role key, so it only runs where
// SUPABASE_SECRET_KEY is set: locally against `supabase start`, or by you against
// production after the site schema is applied there. Roles: `staff` edits the website;
// `dev` is you (the developer console, later).

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, role, ...nameParts] = process.argv.slice(2);
if (!email || !["staff", "dev"].includes(role)) {
  console.error("usage: node --env-file=.env.local scripts/create-staff.mjs <email> <staff|dev> [display name]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.example).");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const password = randomBytes(12).toString("base64url");

let userId;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  // Already exists: find it and reset the password instead.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw created.error;
  userId = existing.id;
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
  if (updateError) throw updateError;
} else {
  userId = created.data.user.id;
}

const { error } = await admin
  .schema("site")
  .from("staff")
  .upsert({ user_id: userId, role, display_name: nameParts.join(" ") || null });
if (error) throw error;

console.log(`${email} is now ${role} on ${url}`);
console.log(`password: ${password}`);

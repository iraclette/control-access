"use client";

import { createClient } from "@supabase/supabase-js";
import type { SiteClient } from "@/lib/supabase";

// Browser client for the staff console: signs in with Supabase Auth and keeps the session
// in localStorage, so every query runs as that staff member and RLS (site.is_staff())
// decides what they may change. Separate from the public client, which never has a session.
let cached: SiteClient | null = null;

export function getStaffClient(): SiteClient {
  if (cached) return cached;
  cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: "site" },
    auth: { persistSession: true, storageKey: "d22-staff-auth" },
  });
  return cached;
}

// Uploads an image to the public `site` bucket and returns its storage path.
export async function uploadSiteImage(file: File, folder: string): Promise<string> {
  const ext = file.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getStaffClient().storage.from("site").upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

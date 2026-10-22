import { createClient } from "@supabase/supabase-js";
import "server-only";
import type { SiteClient } from "@/lib/supabase";

// Service-role client for the `site` schema, bypasses RLS. Server only.
// Created lazily so `next build` doesn't crash without env vars.
let cached: SiteClient | null = null;

export function getSupabaseAdmin(): SiteClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  }

  cached = createClient(url, key, { db: { schema: "site" } });
  return cached;
}

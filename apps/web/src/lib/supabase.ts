import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// No generated types yet, so the schema parameter is spelled out.
export type SiteClient = SupabaseClient<any, "site", "site">; // eslint-disable-line @typescript-eslint/no-explicit-any

// Read-only anon client for the `site` schema; RLS only lets it see published content.
// Created lazily so `next build` doesn't crash without env vars.
let cached: SiteClient | null = null;

export function getSupabaseClient(): SiteClient {
  if (cached) return cached;
  cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    db: { schema: "site" },
    auth: { persistSession: false },
  });
  return cached;
}

// Images are either bundled demo files ("/demo/...") / absolute URLs, or paths in the
// public `site` storage bucket.
export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/") || path.startsWith("http")) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site/${path}`;
}

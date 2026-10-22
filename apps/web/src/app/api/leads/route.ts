import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isNonEmptyString, isOptionalString, isPhoneOrEmail, isUuid, isValidEmail } from "@/lib/validate";
import { hasLocale } from "@/i18n/config";

type LeadRequest = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown; // honeypot
  projectId?: unknown;
  flatId?: unknown;
  locale?: unknown;
};

const blank = (v: unknown) => v === undefined || v === null || v === "";

// Leads only ever reach the database through here, with the service role: browsers have
// no grant on site.leads at all, so the anon key can't be used to spam or read them.
export async function POST(request: NextRequest) {
  if (!checkRateLimit(`lead:${getClientIp(request)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as LeadRequest;

  // Bots fill every field; pretend it worked so they don't retry.
  if (!blank(body.website)) return NextResponse.json({ ok: true });

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const valid =
    isNonEmptyString(body.name, 200) &&
    isPhoneOrEmail(phone) &&
    !phone.includes("@") &&
    (email === "" || isValidEmail(email)) &&
    isOptionalString(body.message, 3000) &&
    (blank(body.projectId) || isUuid(body.projectId)) &&
    (blank(body.flatId) || isUuid(body.flatId));
  if (!valid) return NextResponse.json({ code: "invalid_fields" }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from("leads")
    .insert({
      name: (body.name as string).trim(),
      phone,
      email: email || null,
      message: typeof body.message === "string" && body.message.trim() ? body.message.trim() : null,
      project_id: blank(body.projectId) ? null : body.projectId,
      flat_id: blank(body.flatId) ? null : body.flatId,
      locale: typeof body.locale === "string" && hasLocale(body.locale) ? body.locale : null,
    });

  if (error) {
    console.error("Lead insert failed:", error.message);
    return NextResponse.json({ code: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

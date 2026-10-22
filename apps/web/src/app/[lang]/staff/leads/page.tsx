"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import StaffShell from "@/components/staff/StaffShell";
import { useI18n } from "@/i18n/client";
import { fmt, formatDate, pick, type Localized } from "@/i18n/format";
import { getStaffClient } from "@/lib/staffClient";

type LeadStatus = "new" | "contacted" | "closed";
type Lead = {
  id: string;
  created_at: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  locale: string | null;
  status: LeadStatus;
  staff_note: string | null;
  project: { slug: string; name: Localized } | null;
  flat: { id: string; number: string } | null;
};

export default function StaffLeadsPage() {
  return <StaffShell>{() => <Leads />}</StaffShell>;
}

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "border-accent text-accent",
  contacted: "border-reserved text-reserved",
  closed: "border-line text-muted",
};

function Leads() {
  const { lang, dict } = useI18n();
  const supabase = getStaffClient();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState<LeadStatus | "all">("new");

  useEffect(() => {
    supabase
      .from("leads")
      .select("id, created_at, name, phone, email, message, locale, status, staff_note, project:projects(slug, name), flat:flats(id, number)")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setLeads((data ?? []) as unknown as Lead[]));
  }, [supabase]);

  async function update(id: string, patch: Partial<Pick<Lead, "status" | "staff_note">>) {
    setLeads((list) => list?.map((l) => (l.id === id ? { ...l, ...patch } : l)) ?? null);
    await supabase.from("leads").update(patch).eq("id", id);
  }

  const shown = (leads ?? []).filter((l) => filter === "all" || l.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{dict.staff.nav.leads}</h1>
        <div role="tablist" className="flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
          {(["new", "contacted", "closed", "all"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={filter === s}
              onClick={() => setFilter(s)}
              className={`rounded-md px-3 py-1 ${filter === s ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {s === "all" ? dict.filters.any : dict.staff.leads.status[s]}
              {leads && s !== "all" && ` (${leads.filter((l) => l.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      {leads == null ? (
        <p className="text-muted">{dict.staff.common.loading}</p>
      ) : shown.length === 0 ? (
        <p className="text-muted">{dict.staff.leads.none}</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((l) => (
            <li key={l.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-xs text-muted">
                    {dict.staff.leads.received}: {formatDate(l.created_at, lang, { dateStyle: "medium", timeStyle: "short" })}
                    {l.locale && ` · ${l.locale.toUpperCase()}`}
                  </p>
                </div>
                <select
                  value={l.status}
                  onChange={(e) => update(l.id, { status: e.target.value as LeadStatus })}
                  className={`rounded-lg border bg-surface px-2 py-1 text-sm ${STATUS_STYLE[l.status]}`}
                >
                  {(["new", "contacted", "closed"] as const).map((s) => (
                    <option key={s} value={s}>{dict.staff.leads.status[s]}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {l.phone && (
                  <a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:border-accent">
                    <Phone className="h-4 w-4" aria-hidden="true" /> {l.phone}
                  </a>
                )}
                {l.email && (
                  <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:border-accent">
                    <Mail className="h-4 w-4" aria-hidden="true" /> {l.email}
                  </a>
                )}
              </div>
              {(l.project || l.flat) && (
                <p className="text-sm">
                  <span className="text-muted">{dict.staff.leads.about}: </span>
                  {l.flat ? (
                    <Link href={`/flats/${l.flat.id}`} target="_blank" className="text-accent hover:underline">
                      {fmt(dict.flat.title, { n: l.flat.number })}
                    </Link>
                  ) : null}
                  {l.flat && l.project ? ", " : ""}
                  {l.project && (
                    <Link href={`/projects/${l.project.slug}`} target="_blank" className="text-accent hover:underline">
                      {pick(l.project.name, lang)}
                    </Link>
                  )}
                </p>
              )}
              {l.message && <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{l.message}</p>}
              <label className="block space-y-1 text-xs">
                <span className="text-muted">{dict.staff.leads.note}</span>
                <textarea
                  key={`${l.id}-note`}
                  defaultValue={l.staff_note ?? ""}
                  rows={2}
                  onBlur={(e) => e.target.value !== (l.staff_note ?? "") && update(l.id, { staff_note: e.target.value || null })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

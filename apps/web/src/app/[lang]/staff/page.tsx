"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StaffShell from "@/components/staff/StaffShell";
import { useI18n } from "@/i18n/client";
import { pick, type Localized } from "@/i18n/format";
import { getStaffClient } from "@/lib/staffClient";
import type { FlatStatus } from "@/lib/site";

type Row = { project: { id: string; name: Localized }; counts: Record<FlatStatus, number> };

export default function StaffHome() {
  return <StaffShell>{() => <Overview />}</StaffShell>;
}

function Overview() {
  const { lang, dict } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [newLeads, setNewLeads] = useState<number | null>(null);

  useEffect(() => {
    const supabase = getStaffClient();
    Promise.all([
      supabase.from("projects").select("id, name, sort_order, buildings(flats(status))").order("sort_order"),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    ]).then(([projects, leads]) => {
      type P = { id: string; name: Localized; buildings: { flats: { status: FlatStatus }[] }[] };
      setRows(
        ((projects.data ?? []) as unknown as P[]).map((p) => {
          const counts = { available: 0, reserved: 0, sold: 0 };
          p.buildings.forEach((b) => b.flats.forEach((f) => (counts[f.status] += 1)));
          return { project: { id: p.id, name: p.name }, counts };
        }),
      );
      setNewLeads(leads.count ?? 0);
    });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{dict.staff.nav.dashboard}</h1>
      <Link href="/staff/leads" className="block rounded-xl border border-line bg-surface p-5 hover:border-accent">
        <p className="text-sm text-muted">{dict.staff.dashboard.newLeads}</p>
        <p className="text-3xl font-semibold">{newLeads ?? "…"}</p>
      </Link>
      <section className="rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3 font-medium">{dict.staff.dashboard.flatsByStatus}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-5 py-2 font-normal">{dict.staff.dashboard.project}</th>
                <th className="px-3 py-2 font-normal text-available">{dict.flat.status.available}</th>
                <th className="px-3 py-2 font-normal text-reserved">{dict.flat.status.reserved}</th>
                <th className="px-3 py-2 font-normal text-sold">{dict.flat.status.sold}</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.project.id} className="border-t border-line">
                  <td className="px-5 py-2">
                    <Link href={`/staff/flats?project=${r.project.id}`} className="hover:text-accent">{pick(r.project.name, lang)}</Link>
                  </td>
                  <td className="px-3 py-2">{r.counts.available}</td>
                  <td className="px-3 py-2">{r.counts.reserved}</td>
                  <td className="px-3 py-2">{r.counts.sold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

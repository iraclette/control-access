"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import LocalizedField from "@/components/staff/LocalizedField";
import { useI18n } from "@/i18n/client";
import { fmt, pick, type Localized } from "@/i18n/format";
import { getStaffClient } from "@/lib/staffClient";

type Building = { id: string; name: Localized; floors: number; sort_order: number; flats: { count: number }[] };

// The buildings of one project. Most projects have one; a complex has several.
export default function BuildingsEditor({ projectId }: { projectId: string }) {
  const { lang, dict } = useI18n();
  const supabase = getStaffClient();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [draft, setDraft] = useState<{ name: Localized; floors: string } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const { data } = await supabase
      .from("buildings")
      .select("id, name, floors, sort_order, flats(count)")
      .eq("project_id", projectId)
      .order("sort_order");
    setBuildings((data ?? []) as unknown as Building[]);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from Supabase when the project changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the project changes
  }, [projectId]);

  async function update(id: string, patch: Partial<Pick<Building, "name" | "floors">>) {
    setBuildings((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const { error: e } = await supabase.from("buildings").update(patch).eq("id", id);
    setError(e ? dict.staff.common.saveFailed : "");
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const floors = Number(draft.floors);
    if (!pick(draft.name, lang) || !Number.isInteger(floors) || floors < 1) return setError(dict.errors.invalid_fields);
    const { error: e } = await supabase
      .from("buildings")
      .insert({ project_id: projectId, name: draft.name, floors, sort_order: buildings.length });
    if (e) return setError(dict.staff.common.saveFailed);
    setDraft(null);
    setError("");
    load();
  }

  async function remove(building: Building) {
    if (!confirm(dict.staff.projects.deleteBuildingConfirm)) return;
    const { error: e } = await supabase.from("buildings").delete().eq("id", building.id);
    if (e) return setError(dict.staff.common.saveFailed);
    load();
  }

  const field = "rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{dict.staff.projects.buildings}</h2>
        {!draft && (
          <button type="button" onClick={() => setDraft({ name: {}, floors: "10" })} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent">
            {dict.staff.projects.addBuilding}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-line">
        {buildings.map((b) => (
          <li key={b.id} className="flex flex-wrap items-end gap-3 py-3">
            <label className="space-y-1 text-sm">
              <span className="block text-muted">{dict.staff.projects.buildingName} ({dict.staff.common.languages[lang]})</span>
              <input
                key={`${b.id}-${lang}`}
                defaultValue={b.name[lang] ?? ""}
                onBlur={(e) => e.target.value !== (b.name[lang] ?? "") && update(b.id, { name: { ...b.name, [lang]: e.target.value } })}
                className={field}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-muted">{dict.staff.projects.floors}</span>
              <input
                key={`${b.id}-floors`}
                type="number"
                min={1}
                defaultValue={b.floors}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isInteger(n) && n >= 1 && n !== b.floors) update(b.id, { floors: n });
                }}
                className={`${field} w-24`}
              />
            </label>
            <span className="pb-2 text-sm text-muted">{fmt(dict.staff.flats.count, { n: b.flats[0]?.count ?? 0 })}</span>
            <button type="button" onClick={() => remove(b)} aria-label={dict.staff.common.delete} className="ml-auto inline-flex items-center gap-1 pb-2 text-sm text-red-600 hover:underline">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> {dict.staff.common.delete}
            </button>
          </li>
        ))}
      </ul>
      {draft && (
        <form onSubmit={add} className="grid gap-4 border-t border-line pt-4 lg:grid-cols-[1fr_8rem_auto] lg:items-end">
          <LocalizedField label={dict.staff.projects.buildingName} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <label className="space-y-1 text-sm">
            <span className="block text-muted">{dict.staff.projects.floors}</span>
            <input type="number" min={1} value={draft.floors} onChange={(e) => setDraft({ ...draft, floors: e.target.value })} className={`${field} w-full`} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm text-brand-fg">{dict.staff.projects.addBuilding}</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-2 text-sm text-muted">{dict.staff.common.cancel}</button>
          </div>
        </form>
      )}
    </section>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import StaffShell from "@/components/staff/StaffShell";
import ProjectPicker from "@/components/staff/ProjectPicker";
import AddFlats, { type StaffBuilding } from "@/components/staff/AddFlats";
import { useProjects } from "@/components/staff/useProjects";
import { useI18n } from "@/i18n/client";
import { fmt, formatArea, formatUsd, pick } from "@/i18n/format";
import { getStaffClient } from "@/lib/staffClient";
import type { FlatStatus } from "@/lib/site";

type StaffFlat = {
  id: string;
  building_id: string;
  number: string;
  floor: number;
  rooms: number;
  area_m2: number;
  price_per_m2_usd: number | null;
  status: FlatStatus;
  published: boolean;
};

type SaveState = "saving" | "saved" | "error";

export default function StaffFlatsPage() {
  return (
    <StaffShell>
      {() => (
        <Suspense>
          <FlatsEditor />
        </Suspense>
      )}
    </StaffShell>
  );
}

const STATUS_STYLE: Record<FlatStatus, string> = {
  available: "border-available text-available",
  reserved: "border-reserved text-reserved",
  sold: "border-sold text-sold",
};

function FlatsEditor() {
  const { lang, dict } = useI18n();
  const supabase = getStaffClient();
  const { projects, setProjects, project, select } = useProjects();
  const [flats, setFlats] = useState<StaffFlat[] | null>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<Record<string, SaveState>>({});
  const [rateDraft, setRateDraft] = useState("");
  const [buildings, setBuildings] = useState<StaffBuilding[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  async function load(projectId: string) {
    const [b, f] = await Promise.all([
      supabase.from("buildings").select("id, name, floors").eq("project_id", projectId).order("sort_order"),
      supabase
        .from("flats")
        .select("id, building_id, number, floor, rooms, area_m2, price_per_m2_usd, status, published, buildings!inner(project_id)")
        .eq("buildings.project_id", projectId),
    ]);
    const rows = ((f.data ?? []) as unknown as StaffFlat[]).map((x) => ({ ...x, area_m2: Number(x.area_m2) }));
    rows.sort((a, c) => a.floor - c.floor || a.number.localeCompare(c.number, undefined, { numeric: true }));
    setBuildings((b.data ?? []) as StaffBuilding[]);
    setFlats(rows);
  }

  useEffect(() => {
    if (!project) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form for the newly picked project
    setRateDraft(project.price_per_m2_usd?.toString() ?? "");
    load(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the project changes
  }, [project?.id]);

  async function saveDetails(flat: StaffFlat, form: HTMLFormElement) {
    const data = new FormData(form);
    const patch = {
      number: String(data.get("number") ?? "").trim(),
      floor: Number(data.get("floor")),
      rooms: Number(data.get("rooms")),
      area_m2: Number(data.get("area")),
    };
    if (!patch.number || !Number.isInteger(patch.floor) || !Number.isInteger(patch.rooms) || patch.rooms < 1 || !(patch.area_m2 > 0)) {
      return setState((s) => ({ ...s, [flat.id]: "error" }));
    }
    const clash = flats?.some((f) => f.id !== flat.id && f.building_id === flat.building_id && f.number === patch.number);
    if (clash) return alert(fmt(dict.staff.flats.duplicate, { n: patch.number }));
    await update(flat.id, patch);
    setEditing(null);
  }

  async function removeFlat(flat: StaffFlat) {
    if (!confirm(fmt(dict.staff.flats.deleteFlatConfirm, { n: flat.number }))) return;
    const { error } = await supabase.from("flats").delete().eq("id", flat.id);
    if (error) return setState((s) => ({ ...s, [flat.id]: "error" }));
    setFlats((list) => list?.filter((f) => f.id !== flat.id) ?? null);
  }

  // Each change saves straight away (no save button to forget); the row shows the outcome.
  async function update(id: string, patch: Partial<StaffFlat>) {
    setFlats((list) => list?.map((f) => (f.id === id ? { ...f, ...patch } : f)) ?? null);
    setState((s) => ({ ...s, [id]: "saving" }));
    const { error } = await supabase.from("flats").update(patch).eq("id", id);
    setState((s) => ({ ...s, [id]: error ? "error" : "saved" }));
  }

  async function saveProjectRate() {
    if (!project) return;
    const value = rateDraft.trim() === "" ? null : Number(rateDraft);
    if (value != null && (Number.isNaN(value) || value <= 0)) return;
    setState((s) => ({ ...s, project: "saving" }));
    const { error } = await supabase.from("projects").update({ price_per_m2_usd: value }).eq("id", project.id);
    setState((s) => ({ ...s, project: error ? "error" : "saved" }));
    if (!error) setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, price_per_m2_usd: value } : p)));
  }

  const shown = (flats ?? []).filter((f) => !query.trim() || f.number.includes(query.trim()));
  const badge = (s: SaveState | undefined) =>
    s === "saving" ? dict.staff.common.saving : s === "saved" ? dict.staff.common.saved : s === "error" ? dict.staff.common.saveFailed : "";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{dict.staff.nav.flats}</h1>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface p-4">
        <ProjectPicker projects={projects} value={project?.id} onChange={select} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveProjectRate();
          }}
          className="flex items-end gap-2"
        >
          <label className="space-y-1 text-sm">
            <span className="block text-muted">{dict.staff.flats.projectRate}</span>
            <input value={rateDraft} onChange={(e) => setRateDraft(e.target.value)} inputMode="decimal" className="w-32 rounded-lg border border-line bg-surface px-3 py-2" />
          </label>
          <button type="submit" className="rounded-lg bg-brand px-3 py-2 text-sm text-brand-fg">{dict.staff.common.save}</button>
          <span className="pb-2 text-xs text-muted" role="status">{badge(state.project)}</span>
        </form>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={dict.staff.flats.search}
          inputMode="numeric"
          className="ml-auto w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      </div>

      {flats != null && project && (
        <AddFlats
          key={project.id}
          buildings={buildings}
          existingNumbers={(buildingId) => new Set(flats.filter((f) => f.building_id === buildingId).map((f) => f.number))}
          onAdded={() => load(project.id)}
        />
      )}

      {flats == null ? (
        <p className="text-muted">{dict.staff.common.loading}</p>
      ) : (
        <>
          <p className="text-sm text-muted">{fmt(dict.staff.flats.count, { n: shown.length })}</p>
          {/* Cards rather than a wide table: staff edit this from their phones. */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((f) => {
              const rate = f.price_per_m2_usd ?? project?.price_per_m2_usd ?? null;
              return (
                <li key={f.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {fmt(dict.flat.title, { n: f.number })}
                      {buildings.length > 1 && (
                        <span className="ml-1 text-xs font-normal text-muted">{pick(buildings.find((b) => b.id === f.building_id)?.name, lang)}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {fmt(dict.flat.floorN, { n: f.floor })} · {dict.flat.rooms}: {f.rooms} · {formatArea(f.area_m2, lang)}
                    </p>
                  </div>
                  <div role="radiogroup" aria-label={fmt(dict.flat.title, { n: f.number })} className="grid grid-cols-3 gap-1">
                    {(["available", "reserved", "sold"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={f.status === s}
                        onClick={() => f.status !== s && update(f.id, { status: s })}
                        className={`rounded-lg border px-2 py-1.5 text-xs ${f.status === s ? `${STATUS_STYLE[s]} font-semibold` : "border-line text-muted"}`}
                      >
                        {dict.flat.status[s]}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex-1 space-y-1 text-xs">
                      <span className="text-muted">{dict.staff.flats.ownRate}</span>
                      <input
                        key={`${f.id}-${f.price_per_m2_usd}`}
                        defaultValue={f.price_per_m2_usd ?? ""}
                        placeholder={dict.staff.flats.ownRateHint}
                        inputMode="decimal"
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const value = raw === "" ? null : Number(raw);
                          if (value !== null && (Number.isNaN(value) || value <= 0)) return;
                          if (value !== f.price_per_m2_usd) update(f.id, { price_per_m2_usd: value });
                        }}
                        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
                      <input type="checkbox" checked={f.published} onChange={(e) => update(f.id, { published: e.target.checked })} className="accent-[var(--accent)]" />
                      {dict.staff.flats.visible}
                    </label>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 border-t border-line pt-2 text-sm">
                    <span className="font-medium text-brand">{rate != null ? formatUsd(Math.round(rate * f.area_m2), lang) : "—"}</span>
                    <span className={`text-xs ${state[f.id] === "error" ? "text-red-600" : "text-muted"}`} role="status">
                      {badge(state[f.id])}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing(editing === f.id ? null : f.id)}
                      aria-expanded={editing === f.id}
                      className="text-xs text-accent hover:underline"
                    >
                      {dict.staff.flats.editDetails}
                    </button>
                  </div>
                  {editing === f.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveDetails(f, e.currentTarget);
                      }}
                      className="grid grid-cols-4 gap-2 border-t border-line pt-3"
                    >
                      {(
                        [
                          ["number", dict.staff.flats.number, f.number],
                          ["floor", dict.flat.floor, f.floor],
                          ["rooms", dict.flat.rooms, f.rooms],
                          ["area", "m²", f.area_m2],
                        ] as const
                      ).map(([name, label, value]) => (
                        <label key={name} className="space-y-1 text-xs">
                          <span className="text-muted">{label}</span>
                          <input name={name} defaultValue={value} inputMode={name === "number" ? "text" : "decimal"} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
                        </label>
                      ))}
                      <div className="col-span-4 flex items-center gap-2">
                        <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs text-brand-fg">{dict.staff.common.save}</button>
                        <button type="button" onClick={() => removeFlat(f)} className="ml-auto text-xs text-red-600 hover:underline">{dict.staff.common.delete}</button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

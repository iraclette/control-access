"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmt, pick, type Localized } from "@/i18n/format";
import { getStaffClient } from "@/lib/staffClient";
import { planFlats, type Numbering } from "@/lib/planFlats";

export type StaffBuilding = { id: string; name: Localized; floors: number };
type Row = { rooms: string; area: string };

type Props = {
  buildings: StaffBuilding[];
  existingNumbers: (buildingId: string) => Set<string>;
  onAdded: () => void;
};

const field = "w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";

export default function AddFlats({ buildings, existingNumbers, onAdded }: Props) {
  const { lang, dict } = useI18n();
  const supabase = getStaffClient();
  const [mode, setMode] = useState<"none" | "one" | "bulk">("none");
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const [one, setOne] = useState({ number: "", floor: "", rooms: "", area: "" });
  const [range, setRange] = useState({ from: "1", to: String(buildings[0]?.floors ?? 1) });
  const [layout, setLayout] = useState<Row[]>([{ rooms: "2", area: "60" }]);
  const [numbering, setNumbering] = useState<Numbering>("seq");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const buildingSelectId = useId();

  const building = buildings.find((b) => b.id === buildingId) ?? buildings[0];
  if (!building) return <p className="text-sm text-muted">{dict.staff.flats.noBuilding}</p>;
  const taken = existingNumbers(building.id);
  const highest = Math.max(0, ...[...taken].map(Number).filter(Number.isFinite));

  const parsedLayout = layout.map((r) => ({ rooms: Number(r.rooms), area: Number(r.area) }));
  const layoutValid = parsedLayout.length > 0 && parsedLayout.every((r) => Number.isInteger(r.rooms) && r.rooms > 0 && r.area > 0);
  const from = Number(range.from);
  const to = Number(range.to);
  const rangeValid = Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to - from < 100;
  const plan = layoutValid && rangeValid ? planFlats({ floorFrom: from, floorTo: to, layout: parsedLayout, numbering, startAfter: highest }) : [];

  async function insert(rows: { number: string; floor: number; rooms: number; area_m2: number }[]) {
    const clash = rows.find((r) => taken.has(r.number));
    if (clash) return setMessage({ ok: false, text: fmt(dict.staff.flats.duplicate, { n: clash.number }) });
    setSaving(true);
    const { error } = await supabase.from("flats").insert(rows.map((r) => ({ ...r, building_id: building.id, status: "available" })));
    // A building taller than recorded grows to fit the new floors.
    const top = Math.max(...rows.map((r) => r.floor));
    if (!error && top > building.floors) await supabase.from("buildings").update({ floors: top }).eq("id", building.id);
    setSaving(false);
    if (error) return setMessage({ ok: false, text: error.code === "23505" ? fmt(dict.staff.flats.duplicate, { n: "?" }) : dict.staff.common.saveFailed });
    setMessage({ ok: true, text: fmt(dict.staff.flats.added, { n: rows.length }) });
    setOne({ number: "", floor: one.floor, rooms: "", area: "" });
    onAdded();
  }

  function addOne(event: React.FormEvent) {
    event.preventDefault();
    const row = { number: one.number.trim(), floor: Number(one.floor), rooms: Number(one.rooms), area_m2: Number(one.area) };
    if (!row.number || !Number.isInteger(row.floor) || !Number.isInteger(row.rooms) || row.rooms < 1 || !(row.area_m2 > 0)) {
      return setMessage({ ok: false, text: dict.errors.invalid_fields });
    }
    insert([row]);
  }

  const tab = (m: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(mode === m ? "none" : m);
        setMessage(null);
      }}
      aria-expanded={mode === m}
      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${mode === m ? "border-accent text-accent" : "border-line hover:border-accent"}`}
    >
      <Plus className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tab("one", dict.staff.flats.addFlat)}
        {tab("bulk", dict.staff.flats.bulkTitle)}
      </div>

      {mode !== "none" && buildings.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {/* Label outside the select: wrapping it would make the options part of its accessible name. */}
          <label htmlFor={buildingSelectId} className="text-muted">{dict.staff.flats.building}</label>
          <select id={buildingSelectId} value={building.id} onChange={(e) => setBuildingId(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">
            {buildings.map((b) => <option key={b.id} value={b.id}>{pick(b.name, lang)}</option>)}
          </select>
        </div>
      )}

      {mode === "one" && (
        <form onSubmit={addOne} className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-5 sm:items-end">
          {(
            [
              ["number", dict.staff.flats.number, "text"],
              ["floor", dict.flat.floor, "numeric"],
              ["rooms", dict.flat.rooms, "numeric"],
              ["area", `${dict.flat.area}, m²`, "decimal"],
            ] as const
          ).map(([key, label, inputMode]) => (
            <label key={key} className="space-y-1 text-xs">
              <span className="text-muted">{label}</span>
              <input value={one[key]} onChange={(e) => setOne({ ...one, [key]: e.target.value })} inputMode={inputMode} required className={field} />
            </label>
          ))}
          <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm text-brand-fg disabled:opacity-60">
            {dict.staff.flats.addFlat}
          </button>
        </form>
      )}

      {mode === "bulk" && (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">{dict.staff.flats.bulkHint}</p>
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1 text-xs">
              <span className="text-muted">{dict.staff.flats.floorFrom}</span>
              <input type="number" min={1} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={`${field} w-24`} />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted">{dict.staff.flats.floorTo}</span>
              <input type="number" min={1} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={`${field} w-24`} />
            </label>
            <fieldset className="space-y-1 text-xs">
              <legend className="text-muted">{dict.staff.flats.numbering}</legend>
              <div className="flex flex-wrap gap-3 pt-1 text-sm">
                {(["seq", "floor"] as const).map((n) => (
                  <label key={n} className="flex items-center gap-1.5">
                    <input type="radio" name="numbering" checked={numbering === n} onChange={() => setNumbering(n)} className="accent-[var(--accent)]" />
                    {n === "seq" ? dict.staff.flats.numberingSeq : dict.staff.flats.numberingFloor}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{dict.staff.flats.perFloor}</legend>
            {layout.map((row, i) => (
              <div key={i} className="flex items-end gap-2">
                <span className="w-6 pb-2 text-sm text-muted">{i + 1}.</span>
                <label className="space-y-1 text-xs">
                  <span className="text-muted">{dict.flat.rooms}</span>
                  <input value={row.rooms} onChange={(e) => setLayout(layout.map((r, j) => (j === i ? { ...r, rooms: e.target.value } : r)))} inputMode="numeric" className={`${field} w-20`} />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-muted">{dict.flat.area}, m²</span>
                  <input value={row.area} onChange={(e) => setLayout(layout.map((r, j) => (j === i ? { ...r, area: e.target.value } : r)))} inputMode="decimal" className={`${field} w-24`} />
                </label>
                {layout.length > 1 && (
                  <button type="button" onClick={() => setLayout(layout.filter((_, j) => j !== i))} aria-label={dict.staff.common.delete} className="pb-2 text-muted hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setLayout([...layout, { rooms: "2", area: "60" }])} className="text-sm text-accent hover:underline">
              + {dict.staff.flats.addRow}
            </button>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <p className="text-sm">
              {plan.length > 0 ? fmt(dict.staff.flats.preview, { n: plan.length, first: plan[0].number, last: plan[plan.length - 1].number }) : dict.errors.invalid_fields}
            </p>
            <button type="button" disabled={saving || plan.length === 0} onClick={() => insert(plan)} className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm text-brand-fg disabled:opacity-60">
              {saving ? dict.staff.common.saving : dict.staff.flats.addFlats}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-available" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

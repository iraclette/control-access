"use client";

import { useState } from "react";
import LocalizedField from "@/components/staff/LocalizedField";
import type { StaffProject } from "@/components/staff/useProjects";
import { useI18n } from "@/i18n/client";
import { pick, type Localized } from "@/i18n/format";
import { getStaffClient } from "@/lib/staffClient";
import { SLUG_RE, slugify } from "@/lib/slug";
import type { ProjectStatus } from "@/lib/site";

type Props = { sortOrder: number; onCreated: (project: StaffProject) => void; onCancel: () => void };

// A new project starts unpublished with one building, so staff can add flats and images
// before anything shows on the public site.
export default function NewProjectForm({ sortOrder, onCreated, onCancel }: Props) {
  const { lang, dict } = useI18n();
  const supabase = getStaffClient();
  const [name, setName] = useState<Localized>({});
  const [city, setCity] = useState<Localized>({});
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>("under_construction");
  const [rate, setRate] = useState("");
  const [floors, setFloors] = useState("10");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // The address follows the English name (else Georgian) until staff type their own.
  const autoSlug = slugify(name.en || name.ka || name.ru || "");
  const finalSlug = slugEdited ? slug : autoSlug;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!pick(name, lang)) return setError(dict.errors.invalid_fields);
    if (!SLUG_RE.test(finalSlug)) return setError(dict.staff.projects.slugHint);
    const floorCount = Number(floors);
    if (!Number.isInteger(floorCount) || floorCount < 1) return setError(dict.errors.invalid_fields);

    setSaving(true);
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        slug: finalSlug,
        name,
        city,
        status,
        price_per_m2_usd: rate.trim() ? Number(rate) : null,
        sort_order: sortOrder,
        published: false,
      })
      .select("id, slug, name, price_per_m2_usd")
      .single();
    if (projectError || !project) {
      setSaving(false);
      return setError(projectError?.code === "23505" ? dict.staff.projects.slugTaken : dict.staff.common.saveFailed);
    }
    const { error: buildingError } = await supabase
      .from("buildings")
      .insert({ project_id: project.id, name: { ka: "კორპუსი A", en: "Building A", ru: "Корпус A" }, floors: floorCount });
    setSaving(false);
    if (buildingError) return setError(dict.staff.common.saveFailed);
    onCreated(project as StaffProject);
  }

  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <form onSubmit={create} className="grid gap-5 rounded-xl border border-accent bg-surface p-5 lg:grid-cols-2">
      <h2 className="text-lg font-semibold lg:col-span-2">{dict.staff.projects.newProject}</h2>
      <div className="space-y-5">
        <LocalizedField label={dict.staff.projects.name} value={name} onChange={setName} />
        <LocalizedField label={dict.staff.projects.city} value={city} onChange={setCity} />
      </div>
      <div className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{dict.staff.projects.slug}</span>
          <input
            value={finalSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className={`${field} font-mono`}
            spellCheck={false}
          />
          <span className="block text-xs text-muted">{dict.staff.projects.slugHint}</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted">{dict.staff.projects.status}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className={field}>
              {(["planned", "under_construction", "completed"] as const).map((s) => (
                <option key={s} value={s}>{dict.project.status[s]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">{dict.staff.projects.rate}</span>
            <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className={field} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">{dict.staff.projects.floors}</span>
            <input value={floors} onChange={(e) => setFloors(e.target.value)} type="number" min={1} inputMode="numeric" className={field} />
          </label>
        </div>
        <p className="text-xs text-muted">{dict.staff.projects.createdNote}</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg disabled:opacity-60">
            {saving ? dict.staff.common.saving : dict.staff.projects.create}
          </button>
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm text-muted hover:text-fg">
            {dict.staff.common.cancel}
          </button>
        </div>
      </div>
    </form>
  );
}

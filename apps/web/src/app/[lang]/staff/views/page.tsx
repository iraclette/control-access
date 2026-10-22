"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import StaffShell from "@/components/staff/StaffShell";
import ProjectPicker from "@/components/staff/ProjectPicker";
import { useProjects } from "@/components/staff/useProjects";
import { useI18n } from "@/i18n/client";
import { fmt, pick, type Localized } from "@/i18n/format";
import en from "@/i18n/dictionaries/en";
import ka from "@/i18n/dictionaries/ka";
import ru from "@/i18n/dictionaries/ru";
import { getStaffClient, uploadSiteImage } from "@/lib/staffClient";
import { prepareImage } from "@/lib/resizeImage";
import { imageUrl } from "@/lib/supabase";

const KINDS = ["front", "back", "side", "aerial", "floor_plan"] as const;
type Kind = (typeof KINDS)[number];

type View = { id: string; building_id: string; kind: Kind; label: Localized; image_path: string; sort_order: number; hotspots: { count: number }[] };
type Building = { id: string; name: Localized; flats: { count: number }[]; views: View[] };

export default function StaffViewsPage() {
  return (
    <StaffShell>
      {() => (
        <Suspense>
          <Views />
        </Suspense>
      )}
    </StaffShell>
  );
}

function Views() {
  const { lang, dict } = useI18n();
  const supabase = getStaffClient();
  const { projects, project, select } = useProjects();
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [adding, setAdding] = useState<{ building: string; kind: Kind; file: File | null }>({ building: "", kind: "front", file: null });
  const [status, setStatus] = useState<"" | "uploading" | "error">("");

  async function load(projectId: string) {
    const { data } = await supabase
      .from("buildings")
      .select("id, name, flats(count), views(id, building_id, kind, label, image_path, sort_order, hotspots(count))")
      .eq("project_id", projectId)
      .order("sort_order");
    const list = (data ?? []) as unknown as Building[];
    list.forEach((b) => b.views.sort((a, c) => a.sort_order - c.sort_order));
    setBuildings(list);
    setAdding((a) => ({ ...a, building: list[0]?.id ?? "" }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from Supabase when the project changes
    if (project) load(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the project changes
  }, [project?.id]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!adding.file || !adding.building || !project) return;
    setStatus("uploading");
    try {
      const prepared = await prepareImage(adding.file);
      const path = await uploadSiteImage(prepared.file, "views");
      const building = buildings?.find((b) => b.id === adding.building);
      const { error } = await supabase.from("views").insert({
        building_id: adding.building,
        kind: adding.kind,
        // The label defaults to the type's name in every language; staff can rename later.
        label: { ka: ka.staff.views.kinds[adding.kind], en: en.staff.views.kinds[adding.kind], ru: ru.staff.views.kinds[adding.kind] },
        image_path: path,
        image_width: prepared.width,
        image_height: prepared.height,
        sort_order: building?.views.length ?? 0,
      });
      if (error) throw error;
      setAdding((a) => ({ ...a, file: null }));
      setStatus("");
      await load(project.id);
    } catch {
      setStatus("error");
    }
  }

  async function remove(view: View) {
    if (!confirm(dict.staff.common.confirmDelete) || !project) return;
    const { error } = await supabase.from("views").delete().eq("id", view.id);
    // Only uploaded files live in storage; demo drawings ship with the site.
    if (!error && !view.image_path.startsWith("/")) await supabase.storage.from("site").remove([view.image_path]);
    await load(project.id);
  }

  const field = "rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{dict.staff.nav.views}</h1>
        <ProjectPicker projects={projects} value={project?.id} onChange={select} />
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <p className="w-full font-medium">{dict.staff.views.add}</p>
        {buildings && buildings.length > 1 && (
          <label className="space-y-1 text-sm">
            <span className="block text-muted">{dict.staff.views.building}</span>
            <select value={adding.building} onChange={(e) => setAdding({ ...adding, building: e.target.value })} className={field}>
              {buildings.map((b) => <option key={b.id} value={b.id}>{pick(b.name, lang)}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="block text-muted">{dict.staff.views.kind}</span>
          <select value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value as Kind })} className={field}>
            {KINDS.map((k) => <option key={k} value={k}>{dict.staff.views.kinds[k]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted">{dict.staff.views.file}</span>
          <input type="file" accept="image/*" required onChange={(e) => setAdding({ ...adding, file: e.target.files?.[0] ?? null })} className="text-sm" />
        </label>
        <button type="submit" disabled={status === "uploading" || !adding.file} className="rounded-lg bg-brand px-4 py-2 text-sm text-brand-fg disabled:opacity-60">
          {status === "uploading" ? dict.staff.common.uploading : dict.staff.common.upload}
        </button>
        {status === "error" && <p role="alert" className="text-sm text-red-600">{dict.staff.common.uploadFailed}</p>}
      </form>

      {buildings?.map((b) => (
        <section key={b.id} className="space-y-3">
          {buildings.length > 1 && <h2 className="text-lg font-semibold">{pick(b.name, lang)}</h2>}
          {b.views.length === 0 ? (
            <p className="text-muted">{dict.staff.views.none}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {b.views.map((v) => (
                <li key={v.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- storage and demo images are served as-is */}
                  <img src={imageUrl(v.image_path) ?? ""} alt="" className="aspect-[16/10] w-full bg-surface-2 object-contain" />
                  <div className="space-y-2 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium">{pick(v.label, lang) || dict.staff.views.kinds[v.kind]}</p>
                      <p className="text-xs text-muted">{fmt(dict.staff.views.regions, { n: v.hotspots[0]?.count ?? 0, total: b.flats[0]?.count ?? 0 })}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/staff/views/${v.id}`} className="rounded-lg bg-brand px-3 py-1.5 text-sm text-brand-fg">{dict.staff.views.editRegions}</Link>
                      <button onClick={() => remove(v)} className="text-sm text-red-600 hover:underline">{dict.staff.common.delete}</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

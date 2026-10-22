"use client";

import { Suspense, useEffect, useState } from "react";
import StaffShell from "@/components/staff/StaffShell";
import ProjectPicker from "@/components/staff/ProjectPicker";
import LocalizedField from "@/components/staff/LocalizedField";
import { useProjects } from "@/components/staff/useProjects";
import { useI18n } from "@/i18n/client";
import { formatDate, pick, type Localized } from "@/i18n/format";
import { getStaffClient, uploadSiteImage } from "@/lib/staffClient";
import { prepareImage } from "@/lib/resizeImage";
import { imageUrl } from "@/lib/supabase";
import type { ProjectStatus } from "@/lib/site";

type ProjectForm = {
  name: Localized;
  city: Localized;
  district: Localized;
  address: Localized;
  summary: Localized;
  description: Localized;
  status: ProjectStatus;
  completion_date: string | null;
  price_per_m2_usd: number | null;
  cover_image: string | null;
  published: boolean;
};

type Update = { id: string; happened_on: string; title: Localized; body: Localized };

export default function StaffProjectsPage() {
  return (
    <StaffShell>
      {() => (
        <Suspense>
          <ProjectsEditor />
        </Suspense>
      )}
    </StaffShell>
  );
}

const STATUSES: ProjectStatus[] = ["planned", "under_construction", "completed"];

function ProjectsEditor() {
  const { lang, dict } = useI18n();
  const supabase = getStaffClient();
  const { projects, setProjects, project, select } = useProjects();
  const [form, setForm] = useState<ProjectForm | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error" | "uploading">("");
  const [draft, setDraft] = useState<Omit<Update, "id">>({ happened_on: new Date().toISOString().slice(0, 10), title: {}, body: {} });

  useEffect(() => {
    if (!project) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the last save message when switching project
    setStatus("");
    Promise.all([
      supabase
        .from("projects")
        .select("name, city, district, address, summary, description, status, completion_date, price_per_m2_usd, cover_image, published")
        .eq("id", project.id)
        .single(),
      supabase.from("progress_updates").select("id, happened_on, title, body").eq("project_id", project.id).order("happened_on", { ascending: false }),
    ]).then(([p, u]) => {
      setForm(p.data as ProjectForm);
      setUpdates((u.data ?? []) as Update[]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the project changes
  }, [project?.id]);

  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!project || !form) return;
    setStatus("saving");
    const { error } = await supabase.from("projects").update(form).eq("id", project.id);
    setStatus(error ? "error" : "saved");
    if (!error) setProjects((list) => list.map((p) => (p.id === project.id ? { ...p, name: form.name, price_per_m2_usd: form.price_per_m2_usd } : p)));
  }

  async function uploadCover(file: File) {
    setStatus("uploading");
    try {
      const prepared = await prepareImage(file);
      set("cover_image", await uploadSiteImage(prepared.file, "covers"));
      setStatus("");
    } catch {
      setStatus("error");
    }
  }

  async function addUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!project || !pick(draft.title, lang)) return;
    const { data, error } = await supabase
      .from("progress_updates")
      .insert({ project_id: project.id, ...draft })
      .select("id, happened_on, title, body")
      .single();
    if (error || !data) return setStatus("error");
    setUpdates((list) => [data as Update, ...list].sort((a, b) => b.happened_on.localeCompare(a.happened_on)));
    setDraft({ happened_on: draft.happened_on, title: {}, body: {} });
  }

  async function removeUpdate(id: string) {
    if (!confirm(dict.staff.common.confirmDelete)) return;
    const { error } = await supabase.from("progress_updates").delete().eq("id", id);
    if (!error) setUpdates((list) => list.filter((u) => u.id !== id));
  }

  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";
  const statusText =
    status === "saving" ? dict.staff.common.saving : status === "saved" ? dict.staff.common.saved
      : status === "uploading" ? dict.staff.common.uploading : status === "error" ? dict.staff.common.saveFailed : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{dict.staff.nav.projects}</h1>
        <ProjectPicker projects={projects} value={project?.id} onChange={select} />
      </div>

      {form && (
        <form onSubmit={save} className="grid gap-6 rounded-xl border border-line bg-surface p-5 lg:grid-cols-2">
          <div className="space-y-5">
            <LocalizedField label={dict.staff.projects.name} value={form.name} onChange={(v) => set("name", v)} />
            <LocalizedField label={dict.staff.projects.city} value={form.city} onChange={(v) => set("city", v)} />
            <LocalizedField label={dict.staff.projects.district} value={form.district} onChange={(v) => set("district", v)} />
            <LocalizedField label={dict.staff.projects.address} value={form.address} onChange={(v) => set("address", v)} />
          </div>
          <div className="space-y-5">
            <LocalizedField label={dict.staff.projects.summary} value={form.summary} onChange={(v) => set("summary", v)} />
            <LocalizedField label={dict.staff.projects.description} value={form.description} onChange={(v) => set("description", v)} multiline />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-muted">{dict.staff.projects.status}</span>
                <select value={form.status} onChange={(e) => set("status", e.target.value as ProjectStatus)} className={field}>
                  {STATUSES.map((s) => <option key={s} value={s}>{dict.project.status[s]}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">{dict.staff.projects.completion}</span>
                <input type="date" value={form.completion_date ?? ""} onChange={(e) => set("completion_date", e.target.value || null)} className={field} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted">{dict.staff.projects.rate}</span>
                <input
                  inputMode="decimal"
                  value={form.price_per_m2_usd ?? ""}
                  onChange={(e) => set("price_per_m2_usd", e.target.value === "" ? null : Number(e.target.value))}
                  className={field}
                />
              </label>
            </div>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- storage and demo images are served as-is */}
              {form.cover_image && <img src={imageUrl(form.cover_image) ?? ""} alt="" className="h-20 w-32 rounded-lg border border-line object-cover" />}
              <label className="space-y-1 text-sm">
                <span className="block text-muted">{dict.staff.projects.cover}</span>
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} className="text-sm" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} className="accent-[var(--accent)]" />
              {dict.staff.projects.published}
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={status === "saving" || status === "uploading"} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg disabled:opacity-60">
                {dict.staff.common.save}
              </button>
              <span role="status" className={`text-sm ${status === "error" ? "text-red-600" : "text-muted"}`}>{statusText}</span>
            </div>
          </div>
        </form>
      )}

      {form && (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">{dict.staff.projects.progress}</h2>
          <form onSubmit={addUpdate} className="grid gap-4 border-b border-line pb-5 lg:grid-cols-[10rem_1fr_1fr_auto] lg:items-start">
            <label className="space-y-1 text-sm">
              <span className="text-muted">{dict.staff.projects.date}</span>
              <input type="date" required value={draft.happened_on} onChange={(e) => setDraft({ ...draft, happened_on: e.target.value })} className={field} />
            </label>
            <LocalizedField label={dict.staff.projects.updateTitle} value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
            <LocalizedField label={dict.staff.projects.updateBody} value={draft.body} onChange={(body) => setDraft({ ...draft, body })} multiline />
            <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm text-brand-fg lg:mt-6">{dict.staff.projects.addUpdate}</button>
          </form>
          <ul className="space-y-3">
            {updates.map((u) => (
              <li key={u.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">{formatDate(u.happened_on, lang, { year: "numeric", month: "long", day: "numeric" })}</p>
                  <p className="font-medium">{pick(u.title, lang)}</p>
                  <p className="text-sm text-muted">{pick(u.body, lang)}</p>
                </div>
                <button onClick={() => removeUpdate(u.id)} className="text-sm text-red-600 hover:underline">{dict.staff.common.delete}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

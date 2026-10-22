"use client";

import { useI18n } from "@/i18n/client";
import { pick } from "@/i18n/format";
import type { StaffProject } from "@/components/staff/useProjects";

export default function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: StaffProject[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const { lang, dict } = useI18n();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{dict.staff.flats.project}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {pick(p.name, lang)}
          </option>
        ))}
      </select>
    </label>
  );
}

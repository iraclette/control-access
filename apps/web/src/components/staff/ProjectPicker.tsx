"use client";

import { useId } from "react";
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
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-sm">
      {/* Label outside the select: wrapping it would make the options part of its accessible name. */}
      <label htmlFor={id} className="text-muted">{dict.staff.flats.project}</label>
      <select
        id={id}
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
    </div>
  );
}

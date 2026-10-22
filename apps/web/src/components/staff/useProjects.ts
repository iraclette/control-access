"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Localized } from "@/i18n/format";
import { getStaffClient } from "@/lib/staffClient";

export type StaffProject = { id: string; slug: string; name: Localized; price_per_m2_usd: number | null };

// Project picker state shared by the staff pages; the choice lives in ?project= so a
// link from the overview (or a reload) lands on the same project.
export function useProjects() {
  const params = useSearchParams();
  const [projects, setProjects] = useState<StaffProject[]>([]);
  const [selected, setSelected] = useState<string | null>(params.get("project"));

  useEffect(() => {
    getStaffClient()
      .from("projects")
      .select("id, slug, name, price_per_m2_usd")
      .order("sort_order")
      .then(({ data }) => {
        const list = (data ?? []) as StaffProject[];
        setProjects(list);
        setSelected((current) => current ?? list[0]?.id ?? null);
      });
  }, []);

  function select(id: string) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("project", id);
    window.history.replaceState(null, "", url);
  }

  return { projects, setProjects, project: projects.find((p) => p.id === selected) ?? null, select };
}

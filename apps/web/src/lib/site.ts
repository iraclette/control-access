import "server-only";
import { cache } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { Localized } from "@/i18n/format";

export type ProjectStatus = "planned" | "under_construction" | "completed";
export type FlatStatus = "available" | "reserved" | "sold";

export type Project = {
  id: string;
  slug: string;
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
  sort_order: number;
};

export type Building = { id: string; project_id: string; name: Localized; floors: number };

export type Flat = {
  id: string;
  building_id: string;
  number: string;
  floor: number;
  rooms: number;
  area_m2: number;
  price_per_m2_usd: number | null;
  status: FlatStatus;
  plan_image: string | null;
};

export type BuildingView = {
  id: string;
  building_id: string;
  kind: string;
  label: Localized;
  image_path: string;
  image_width: number;
  image_height: number;
  sort_order: number;
};

export type Hotspot = { id: string; view_id: string; flat_id: string; points: [number, number][] };

export type ProgressUpdate = {
  id: string;
  project_id: string;
  happened_on: string;
  title: Localized;
  body: Localized;
  image_path: string | null;
};

// A flat with what the listing needs to show it: its project and computed price.
export type FlatListing = Flat & {
  project: Pick<Project, "id" | "slug" | "name" | "status">;
  rate: number | null;
  price: number | null;
};

// Shown price is always rate × area: the flat's own rate if staff set one, else the project's.
export function flatRate(flat: Pick<Flat, "price_per_m2_usd">, project: Pick<Project, "price_per_m2_usd">) {
  return flat.price_per_m2_usd ?? project.price_per_m2_usd ?? null;
}

export function flatPrice(flat: Pick<Flat, "price_per_m2_usd" | "area_m2">, project: Pick<Project, "price_per_m2_usd">) {
  const rate = flatRate(flat, project);
  return rate == null ? null : Math.round(rate * Number(flat.area_m2));
}

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const PROJECT_COLUMNS =
  "id, slug, name, city, district, address, summary, description, status, completion_date, price_per_m2_usd, cover_image, sort_order";
const FLAT_COLUMNS = "id, building_id, number, floor, rooms, area_m2, price_per_m2_usd, status, plan_image";

export const fetchProjects = cache(async (): Promise<Project[]> => {
  const { data, error } = await getSupabaseClient().from("projects").select(PROJECT_COLUMNS).order("sort_order");
  throwIf(error);
  return (data ?? []) as Project[];
});

export const fetchProject = cache(async (slug: string) => {
  const supabase = getSupabaseClient();
  const { data: project, error } = await supabase.from("projects").select(PROJECT_COLUMNS).eq("slug", slug).maybeSingle();
  throwIf(error);
  if (!project) return null;

  const { data: buildings, error: bErr } = await supabase
    .from("buildings")
    .select("id, project_id, name, floors")
    .eq("project_id", project.id)
    .order("sort_order");
  throwIf(bErr);
  const buildingIds = (buildings ?? []).map((b) => b.id);

  const [flats, views, progress] = await Promise.all([
    supabase.from("flats").select(FLAT_COLUMNS).in("building_id", buildingIds).order("floor").order("number"),
    supabase
      .from("views")
      .select("id, building_id, kind, label, image_path, image_width, image_height, sort_order")
      .in("building_id", buildingIds)
      .order("sort_order"),
    supabase
      .from("progress_updates")
      .select("id, project_id, happened_on, title, body, image_path")
      .eq("project_id", project.id)
      .order("happened_on", { ascending: false }),
  ]);
  throwIf(flats.error ?? views.error ?? progress.error);

  const viewIds = (views.data ?? []).map((v) => v.id);
  const { data: hotspots, error: hErr } = await supabase
    .from("hotspots")
    .select("id, view_id, flat_id, points")
    .in("view_id", viewIds);
  throwIf(hErr);

  return {
    project: project as Project,
    buildings: (buildings ?? []) as Building[],
    flats: (flats.data ?? []) as Flat[],
    views: (views.data ?? []) as BuildingView[],
    hotspots: (hotspots ?? []) as Hotspot[],
    progress: (progress.data ?? []) as ProgressUpdate[],
  };
});

// Every published flat with its project, for the listing and project stats. A few hundred
// rows per building, so filtering in memory is simpler and fast enough for now.
export const fetchAllFlats = cache(async (): Promise<FlatListing[]> => {
  const supabase = getSupabaseClient();
  const [projects, buildings, flats] = await Promise.all([
    fetchProjects(),
    supabase.from("buildings").select("id, project_id"),
    supabase.from("flats").select(FLAT_COLUMNS).order("floor").order("number"),
  ]);
  throwIf(buildings.error ?? flats.error);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const projectByBuilding = new Map((buildings.data ?? []).map((b) => [b.id, projectById.get(b.project_id)]));

  return ((flats.data ?? []) as Flat[]).flatMap((flat) => {
    const project = projectByBuilding.get(flat.building_id);
    if (!project) return [];
    return [
      {
        ...flat,
        area_m2: Number(flat.area_m2),
        project: { id: project.id, slug: project.slug, name: project.name, status: project.status },
        rate: flatRate(flat, project),
        price: flatPrice(flat, project),
      },
    ];
  });
});

export const fetchFlat = cache(async (id: string) => {
  const { data, error } = await getSupabaseClient()
    .from("flats")
    .select(`${FLAT_COLUMNS}, buildings!inner(project_id, projects!inner(slug))`)
    .eq("id", id)
    .maybeSingle();
  throwIf(error);
  if (!data) return null;
  const slug = (data as unknown as { buildings: { projects: { slug: string } } }).buildings.projects.slug;
  const detail = await fetchProject(slug);
  if (!detail) return null;
  const flat = detail.flats.find((f) => f.id === id);
  return flat ? { ...detail, flat } : null;
});

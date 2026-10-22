import type { FlatListing } from "@/lib/site";

export type Search = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

// Filtering is a plain GET form: works without JavaScript, and every result is a shareable URL.
export function applyFilters(flats: FlatListing[], q: Search) {
  const project = one(q.project);
  const rooms = num(one(q.rooms));
  const floorFrom = num(one(q.floorFrom));
  const floorTo = num(one(q.floorTo));
  const areaFrom = num(one(q.areaFrom));
  const areaTo = num(one(q.areaTo));
  const maxPrice = num(one(q.maxPrice));
  const onlyAvailable = one(q.available) !== "0"; // on by default

  const result = flats.filter(
    (f) =>
      (!project || f.project.slug === project) &&
      (rooms == null || (rooms >= 4 ? f.rooms >= 4 : f.rooms === rooms)) &&
      (floorFrom == null || f.floor >= floorFrom) &&
      (floorTo == null || f.floor <= floorTo) &&
      (areaFrom == null || f.area_m2 >= areaFrom) &&
      (areaTo == null || f.area_m2 <= areaTo) &&
      (maxPrice == null || (f.price != null && f.price <= maxPrice)) &&
      (onlyAvailable ? f.status === "available" : true),
  );

  const sort = one(q.sort);
  const byPrice = (a: FlatListing, b: FlatListing) => (a.price ?? Infinity) - (b.price ?? Infinity);
  if (sort === "price_desc") result.sort((a, b) => -byPrice(a, b));
  else if (sort === "area") result.sort((a, b) => a.area_m2 - b.area_m2);
  else if (sort === "floor") result.sort((a, b) => a.floor - b.floor);
  else result.sort(byPrice);
  return { result, onlyAvailable };
}

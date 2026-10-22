import { describe, expect, it } from "vitest";
import { applyFilters } from "@/lib/flatFilters";
import type { FlatListing } from "@/lib/site";

const flat = (n: number, over: Partial<FlatListing> = {}): FlatListing => ({
  id: `f${n}`,
  building_id: "b",
  number: String(n),
  floor: n,
  rooms: 2,
  area_m2: 60,
  price_per_m2_usd: null,
  status: "available",
  plan_image: null,
  project: { id: "p", slug: "gori", name: { en: "Gori" }, status: "completed" },
  rate: 700,
  price: 42000,
  ...over,
});

const flats = [
  flat(1, { rooms: 1, area_m2: 40, price: 28000 }),
  flat(2, { rooms: 3, area_m2: 90, price: 63000 }),
  flat(3, { status: "sold" }),
  flat(4, { rooms: 5, area_m2: 130, price: 91000, project: { id: "q", slug: "varketili", name: {}, status: "planned" } }),
];

const ids = (q: Record<string, string>) => applyFilters(flats, q).result.map((f) => f.id);

describe("flat filters", () => {
  it("shows only available flats by default, cheapest first", () => {
    expect(ids({})).toEqual(["f1", "f2", "f4"]);
  });

  it("includes sold flats when 'available only' is unticked", () => {
    expect(ids({ available: "0" })).toContain("f3");
  });

  it("treats 4 rooms as 4 or more", () => {
    expect(ids({ rooms: "4" })).toEqual(["f4"]);
  });

  it("filters by project, floor, area and price", () => {
    expect(ids({ project: "gori" })).toEqual(["f1", "f2"]);
    expect(ids({ floorFrom: "2", floorTo: "3", available: "0" })).toEqual(["f3", "f2"]);
    expect(ids({ areaFrom: "50", areaTo: "100" })).toEqual(["f2"]);
    expect(ids({ maxPrice: "60000" })).toEqual(["f1"]);
  });

  it("ignores junk values instead of failing", () => {
    expect(ids({ rooms: "abc", floorFrom: "" })).toEqual(["f1", "f2", "f4"]);
  });

  it("sorts by price descending, area and floor", () => {
    expect(ids({ sort: "price_desc" })).toEqual(["f4", "f2", "f1"]);
    expect(ids({ sort: "area" })).toEqual(["f1", "f2", "f4"]);
    expect(ids({ sort: "floor" })).toEqual(["f1", "f2", "f4"]);
  });
});

import { describe, expect, it } from "vitest";
import { planFlats } from "@/lib/planFlats";

const layout = [
  { rooms: 2, area: 60 },
  { rooms: 3, area: 90 },
];

describe("planFlats", () => {
  it("numbers in order, continuing after the highest existing number", () => {
    const plan = planFlats({ floorFrom: 2, floorTo: 3, layout, numbering: "seq", startAfter: 10 });
    expect(plan.map((f) => [f.number, f.floor, f.rooms, f.area_m2])).toEqual([
      ["11", 2, 2, 60],
      ["12", 2, 3, 90],
      ["13", 3, 2, 60],
      ["14", 3, 3, 90],
    ]);
  });

  it("numbers by floor", () => {
    const plan = planFlats({ floorFrom: 1, floorTo: 2, layout, numbering: "floor", startAfter: 99 });
    expect(plan.map((f) => f.number)).toEqual(["101", "102", "201", "202"]);
  });

  it("repeats the layout on every floor of the range", () => {
    expect(planFlats({ floorFrom: 1, floorTo: 12, layout, numbering: "seq", startAfter: 0 })).toHaveLength(24);
  });
});

export type Numbering = "seq" | "floor";

// Planned flats for a floor range: the same layout repeated on every floor, numbered either
// on from the building's highest number (1, 2, 3…) or by floor (101, 102… 201…).
export function planFlats(opts: {
  floorFrom: number;
  floorTo: number;
  layout: { rooms: number; area: number }[];
  numbering: Numbering;
  startAfter: number;
}) {
  const flats: { number: string; floor: number; rooms: number; area_m2: number }[] = [];
  let next = opts.startAfter + 1;
  for (let floor = opts.floorFrom; floor <= opts.floorTo; floor++) {
    opts.layout.forEach((row, i) => {
      const number = opts.numbering === "floor" ? String(floor * 100 + i + 1) : String(next++);
      flats.push({ number, floor, rooms: row.rooms, area_m2: row.area });
    });
  }
  return flats;
}

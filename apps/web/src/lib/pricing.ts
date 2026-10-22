// Shown price is always rate × area: the flat's own rate if staff set one, else the
// project's. Totals are never stored, so a project-wide price change updates every flat.
type Rated = { price_per_m2_usd: number | null };

export function flatRate(flat: Rated, project: Rated): number | null {
  return flat.price_per_m2_usd ?? project.price_per_m2_usd ?? null;
}

export function flatPrice(flat: Rated & { area_m2: number | string }, project: Rated): number | null {
  const rate = flatRate(flat, project);
  return rate == null ? null : Math.round(Number(rate) * Number(flat.area_m2));
}

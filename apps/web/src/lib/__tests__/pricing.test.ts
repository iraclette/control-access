import { describe, expect, it } from "vitest";
import { flatPrice, flatRate } from "@/lib/pricing";

describe("flat prices", () => {
  const project = { price_per_m2_usd: 700 };

  it("uses the project rate when the flat has none", () => {
    expect(flatRate({ price_per_m2_usd: null }, project)).toBe(700);
    expect(flatPrice({ price_per_m2_usd: null, area_m2: 64.6 }, project)).toBe(45220);
  });

  it("prefers the flat's own rate", () => {
    expect(flatPrice({ price_per_m2_usd: 740, area_m2: 88 }, project)).toBe(65120);
  });

  it("accepts Postgres numerics as strings", () => {
    expect(flatPrice({ price_per_m2_usd: null, area_m2: "41.7" }, project)).toBe(29190);
  });

  it("has no price when neither has a rate", () => {
    expect(flatPrice({ price_per_m2_usd: null, area_m2: 50 }, { price_per_m2_usd: null })).toBeNull();
  });
});

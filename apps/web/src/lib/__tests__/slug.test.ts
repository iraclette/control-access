import { describe, expect, it } from "vitest";
import { SLUG_RE, slugify } from "@/lib/slug";

describe("slugify", () => {
  it.each([
    ["Gori Residence III", "gori-residence-iii"],
    ["გორის რეზიდენცია", "goris-rezidentsia"],
    ["ვარკეთილის ახალი კორპუსი", "varketilis-akhali-korpusi"],
    ["Резиденция Гори", "rezidentsiya-gori"],
    ["  Ñandú — Tower #2 ", "nandu-tower-2"],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
    expect(SLUG_RE.test(slugify(input))).toBe(true);
  });

  it("matches the database's slug check", () => {
    for (const bad of ["", "-a", "a-", "a--b", "Gori", "a b"]) expect(SLUG_RE.test(bad)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { fmt, formatUsd, pick } from "@/i18n/format";
import en from "@/i18n/dictionaries/en";
import ka from "@/i18n/dictionaries/ka";
import ru from "@/i18n/dictionaries/ru";

describe("translatable text", () => {
  it("falls back to Georgian, then English", () => {
    expect(pick({ ka: "გორი", en: "Gori" }, "ru")).toBe("გორი");
    expect(pick({ en: "Gori" }, "ka")).toBe("Gori");
    expect(pick({ ka: "", en: "Gori" }, "ka")).toBe("Gori");
    expect(pick(null, "en")).toBe("");
  });

  it("fills placeholders", () => {
    expect(fmt("Flat {n}, floor {floor}", { n: 12, floor: 3 })).toBe("Flat 12, floor 3");
    expect(fmt("{missing}", {})).toBe("{missing}");
  });

  it("shows USD with a plain $ in every language", () => {
    expect(formatUsd(94300, "en")).toBe("$94,300");
    for (const lang of ["ka", "ru"] as const) {
      expect(formatUsd(94300, lang)).toContain("$");
      expect(formatUsd(94300, lang)).not.toContain("US");
    }
  });
});

// Every dictionary has the same placeholders as English, so fmt() never prints "{n}".
describe("dictionaries", () => {
  const placeholders = (v: string) => (v.match(/\{\w+\}/g) ?? []).sort().join(",");
  const walk = (a: unknown, b: unknown, path: string, out: string[]) => {
    if (typeof a === "string") {
      if (typeof b !== "string") out.push(`${path} missing`);
      else if (placeholders(a) !== placeholders(b)) out.push(`${path}: ${placeholders(a)} vs ${placeholders(b)}`);
      return;
    }
    for (const key of Object.keys(a as object)) walk((a as never)[key], (b as never)?.[key], `${path}.${key}`, out);
  };

  it.each([["ka", ka], ["ru", ru]])("%s matches English placeholders", (_, dict) => {
    const problems: string[] = [];
    walk(en, dict, "", problems);
    expect(problems).toEqual([]);
  });
});

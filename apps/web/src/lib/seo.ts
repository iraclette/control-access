import type { Metadata } from "next";
import { LOCALES, type Locale } from "@/i18n/config";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const OG_LOCALES: Record<Locale, string> = { ka: "ka_GE", en: "en_US", ru: "ru_RU" };

const localized = (locale: Locale, path: string) => `/${locale}${path === "/" ? "" : path}`;

// Canonical is this language's own URL; hreflang points search engines at the other two,
// and x-default is the plain URL, which picks a language per visitor (same as Shelby).
export function languageAlternates(path: string, locale: Locale): Metadata["alternates"] {
  return {
    canonical: localized(locale, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, localized(l, path)])),
      "x-default": path,
    },
  };
}

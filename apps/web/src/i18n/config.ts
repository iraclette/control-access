// Shared by the proxy, server components and client components, so no server-only imports here.

export const LOCALES = ["ka", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ka";
export const LANG_COOKIE = "d22-lang";

// Each language named in itself, as the switcher shows it.
export const LOCALE_LABELS: Record<Locale, { short: string; name: string }> = {
  ka: { short: "ქარ", name: "ქართული" },
  en: { short: "EN", name: "English" },
  ru: { short: "РУ", name: "Русский" },
};

// "/ru/flats/1" -> "/flats/1"; unprefixed paths come back unchanged.
export function stripLocale(pathname: string): string {
  const prefix = LOCALES.find((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  return prefix ? pathname.slice(prefix.length + 1) || "/" : pathname;
}

export function hasLocale(value: string | undefined | null): value is Locale {
  return LOCALES.includes(value as Locale);
}

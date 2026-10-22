import type { Locale } from "./config";

// fmt("Floor {n}", { n: 5 }) -> "Floor 5"
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

// Translatable database text: {"ka": "...", "en": "...", "ru": "..."}.
export type Localized = Partial<Record<Locale, string>>;

// The visitor's language, else Georgian, else English, else whatever exists.
export function pick(text: Localized | null | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] || text.ka || text.en || Object.values(text).find(Boolean) || "";
}

const NUMBER_LOCALE: Record<Locale, string> = { ka: "ka-GE", en: "en-US", ru: "ru-RU" };

// USD with the separators each language expects: "$94,300" (en), "94 300 $" (ka/ru).
export function formatUsd(amount: number, locale: Locale) {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatArea(area: number, locale: Locale) {
  return `${new Intl.NumberFormat(NUMBER_LOCALE[locale], { maximumFractionDigits: 1 }).format(area)} m²`;
}

export function formatDate(iso: string, locale: Locale, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat(NUMBER_LOCALE[locale], opts).format(new Date(iso));
}

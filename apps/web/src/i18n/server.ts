import { lang } from "next/root-params";
import { notFound } from "next/navigation";
import { hasLocale, type Locale } from "./config";
import en, { type Dictionary } from "./dictionaries/en";
import ka from "./dictionaries/ka";
import ru from "./dictionaries/ru";

const dictionaries: Record<Locale, Dictionary> = { en, ka, ru };

export async function getLocale(): Promise<Locale> {
  const locale = await lang();
  if (!hasLocale(locale)) notFound();
  return locale;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}

export function dictionaryFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "./config";
import type { Dictionary } from "./dictionaries/en";

type I18nContextValue = { lang: Locale; dict: Dictionary };

const I18nContext = createContext<I18nContextValue | null>(null);

// The root layout picks the dictionary on the server and hands it down here,
// so client components don't bundle all three languages.
export function I18nProvider({ lang, dict, children }: I18nContextValue & { children: ReactNode }) {
  return <I18nContext.Provider value={{ lang, dict }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

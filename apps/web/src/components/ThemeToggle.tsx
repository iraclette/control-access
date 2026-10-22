"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/client";

type Theme = "system" | "light" | "dark";
const KEY = "d22-theme";
const ORDER: Theme[] = ["system", "light", "dark"];

// Runs before first paint (inlined in the layout) so a saved dark theme never flashes light.
export const themeInitScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function apply(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice just won't be remembered.
  }
}

// The theme lives on <html data-theme>, outside React; this store lets the button follow it.
const listeners = new Set<() => void>();
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};
const current = (): Theme => {
  const saved = document.documentElement.dataset.theme;
  return saved === "light" || saved === "dark" ? saved : "system";
};

export default function ThemeToggle() {
  const { dict } = useI18n();
  const theme = useSyncExternalStore(subscribe, current, () => "system" as Theme);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const names = { system: dict.nav.themeSystem, light: dict.nav.themeLight, dark: dict.nav.themeDark };
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => {
        apply(next);
        listeners.forEach((notify) => notify());
      }}
      aria-label={`${dict.nav.theme}: ${names[theme]}`}
      title={`${dict.nav.theme}: ${names[theme]}`}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

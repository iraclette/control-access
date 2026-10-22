"use client";

import { LANG_COOKIE, LOCALES, LOCALE_LABELS, stripLocale, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

function saveLocale(locale: Locale) {
  document.cookie = `${LANG_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

// Same as Shelby: save the choice in the cookie the proxy reads, then reload so every
// server-rendered part comes back in the new language. On a language URL (/ru/flats)
// it goes to the plain one, which the cookie then decides.
export default function LanguageSwitcher() {
  const { lang, dict } = useI18n();

  function choose(locale: Locale) {
    if (locale === lang) return;
    saveLocale(locale);
    const path = stripLocale(window.location.pathname);
    if (path === window.location.pathname) window.location.reload();
    else window.location.assign(path + window.location.search);
  }

  return (
    <div role="group" aria-label={dict.nav.language} className="flex items-center">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          onClick={() => choose(locale)}
          aria-pressed={locale === lang}
          title={LOCALE_LABELS[locale].name}
          className={`min-h-10 min-w-10 rounded-lg px-2 text-xs ${
            locale === lang ? "font-semibold text-accent" : "text-muted hover:text-fg"
          }`}
        >
          {LOCALE_LABELS[locale].short}
        </button>
      ))}
    </div>
  );
}

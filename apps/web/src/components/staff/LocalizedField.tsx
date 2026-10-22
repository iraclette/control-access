"use client";

import { LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import type { Localized } from "@/i18n/format";

// One input per language for translatable database text ({"ka", "en", "ru"}).
// Georgian first: it's the site's default and the fallback when a language is empty.
export default function LocalizedField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: Localized;
  onChange: (next: Localized) => void;
  multiline?: boolean;
}) {
  const { dict } = useI18n();
  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {LOCALES.map((locale) => (
        <label key={locale} className="flex items-start gap-2 text-sm">
          <span className="w-20 shrink-0 pt-2 text-xs text-muted">{dict.staff.common.languages[locale]}</span>
          {multiline ? (
            <textarea lang={locale} rows={3} value={value[locale] ?? ""} onChange={(e) => onChange({ ...value, [locale]: e.target.value })} className={field} />
          ) : (
            <input lang={locale} value={value[locale] ?? ""} onChange={(e) => onChange({ ...value, [locale]: e.target.value })} className={field} />
          )}
        </label>
      ))}
    </fieldset>
  );
}

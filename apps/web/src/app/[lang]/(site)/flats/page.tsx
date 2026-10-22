import type { Metadata } from "next";
import Link from "next/link";
import FlatCard from "@/components/FlatCard";
import { getDictionary, getLocale } from "@/i18n/server";
import { fmt, pick } from "@/i18n/format";
import { fetchAllFlats, fetchProjects } from "@/lib/site";
import { applyFilters, one, type Search } from "@/lib/flatFilters";
import { languageAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [dict, lang] = await Promise.all([getDictionary(), getLocale()]);
  return { title: dict.meta.flats, alternates: languageAlternates("/flats", lang) };
}

export default async function FlatsPage({ searchParams }: PageProps<"/[lang]/flats">) {
  const q = (await searchParams) as Search;
  const [lang, dict, projects, flats] = await Promise.all([getLocale(), getDictionary(), fetchProjects(), fetchAllFlats()]);
  const { result, onlyAvailable } = applyFilters(flats, q);
  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{dict.filters.title}</h1>

      <form method="get" className="mt-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-muted">{dict.filters.project}</span>
          <select name="project" defaultValue={one(q.project)} className={field}>
            <option value="">{dict.filters.any}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {pick(p.name, lang)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">{dict.filters.rooms}</span>
          <select name="rooms" defaultValue={one(q.rooms)} className={field}>
            <option value="">{dict.filters.any}</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4+</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">{dict.filters.floorFrom}</span>
            <input name="floorFrom" type="number" min={1} inputMode="numeric" defaultValue={one(q.floorFrom)} className={field} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">{dict.filters.floorTo}</span>
            <input name="floorTo" type="number" min={1} inputMode="numeric" defaultValue={one(q.floorTo)} className={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">{dict.filters.areaFrom}</span>
            <input name="areaFrom" type="number" min={0} inputMode="numeric" defaultValue={one(q.areaFrom)} className={field} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">{dict.filters.areaTo}</span>
            <input name="areaTo" type="number" min={0} inputMode="numeric" defaultValue={one(q.areaTo)} className={field} />
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-muted">{dict.filters.maxPrice}</span>
          <input name="maxPrice" type="number" min={0} step={1000} inputMode="numeric" defaultValue={one(q.maxPrice)} className={field} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">{dict.filters.sort}</span>
          <select name="sort" defaultValue={one(q.sort)} className={field}>
            <option value="">{dict.filters.sortPriceAsc}</option>
            <option value="price_desc">{dict.filters.sortPriceDesc}</option>
            <option value="area">{dict.filters.sortAreaAsc}</option>
            <option value="floor">{dict.filters.sortFloor}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          {/* Unchecked boxes send nothing, so a hidden 0 sits first and the checkbox overrides it. */}
          <input type="hidden" name="available" value="0" />
          <input type="checkbox" name="available" value="1" defaultChecked={onlyAvailable} className="accent-[var(--accent)]" />
          {dict.filters.onlyAvailable}
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90">
            {dict.filters.apply}
          </button>
          <Link href="/flats" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
            {dict.filters.reset}
          </Link>
        </div>
      </form>

      <p className="mt-6 text-sm text-muted" aria-live="polite">
        {fmt(dict.filters.results, { n: result.length })}
      </p>
      {result.length === 0 ? (
        <p className="mt-4">{dict.filters.none}</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {result.map((f) => (
            <FlatCard key={f.id} flat={f} dict={dict} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

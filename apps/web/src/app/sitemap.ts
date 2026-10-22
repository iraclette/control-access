import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { fetchAllFlats, fetchProjects } from "@/lib/site";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

const localized = (locale: string, path: string) => `${SITE_URL}/${locale}${path === "/" ? "" : path}`;

// Every language version of a page, each listing the others (hreflang).
function entries(path: string): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((locale) => [locale, localized(locale, path)]));
  return LOCALES.map((locale) => ({ url: localized(locale, path), alternates: { languages } }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, flats] = await Promise.all([fetchProjects(), fetchAllFlats()]);
  return [
    ...["/", "/projects", "/flats", "/contact"].flatMap((p) => entries(p)),
    ...projects.flatMap((p) => entries(`/projects/${p.slug}`)),
    ...flats.filter((f) => f.status !== "sold").flatMap((f) => entries(`/flats/${f.id}`)),
  ];
}

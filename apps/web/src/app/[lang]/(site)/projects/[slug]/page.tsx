import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BuildingExplorer from "@/components/BuildingExplorer";
import FlatCard from "@/components/FlatCard";
import LeadForm from "@/components/LeadForm";
import { getDictionary, getLocale } from "@/i18n/server";
import { fmt, formatDate, formatUsd, pick } from "@/i18n/format";
import { fetchAllFlats, fetchProject } from "@/lib/site";
import { imageUrl } from "@/lib/supabase";
import { languageAlternates } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[lang]/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [lang, detail] = await Promise.all([getLocale(), fetchProject(slug)]);
  if (!detail) return {};
  return {
    title: `${pick(detail.project.name, lang)} — Developer22`,
    description: pick(detail.project.summary, lang),
    alternates: languageAlternates(`/projects/${slug}`, lang),
  };
}

export default async function ProjectPage({ params }: PageProps<"/[lang]/projects/[slug]">) {
  const { slug } = await params;
  const [lang, dict, detail, allFlats] = await Promise.all([getLocale(), getDictionary(), fetchProject(slug), fetchAllFlats()]);
  if (!detail) notFound();
  const { project, views, hotspots, progress } = detail;
  const flats = allFlats.filter((f) => f.project.id === project.id);
  const available = flats.filter((f) => f.status === "available").length;
  const name = pick(project.name, lang);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 space-y-2">
        <p className="text-sm font-medium text-accent">{dict.project.status[project.status]}</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">{name}</h1>
        <p className="text-muted">
          {[pick(project.district, lang), pick(project.city, lang)].filter(Boolean).join(", ")}
          {project.completion_date &&
            ` · ${fmt(project.status === "completed" ? dict.project.completedOn : dict.project.expectedOn, {
              date: formatDate(project.completion_date, lang),
            })}`}
        </p>
        <p className="text-sm">
          {fmt(dict.project.availableCount, { n: available, total: flats.length })}
          {project.price_per_m2_usd != null &&
            ` · ${fmt(dict.project.pricePerM2From, { price: formatUsd(project.price_per_m2_usd, lang) })}`}
        </p>
        {pick(project.description, lang) && <p className="max-w-3xl pt-2 text-muted">{pick(project.description, lang)}</p>}
      </header>

      {views.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold">{dict.project.explore}</h2>
          <BuildingExplorer
            views={views.map((v) => ({ ...v, image_path: imageUrl(v.image_path) ?? v.image_path }))}
            hotspots={hotspots}
            flats={flats.map((f) => ({
              id: f.id,
              number: f.number,
              floor: f.floor,
              rooms: f.rooms,
              area_m2: f.area_m2,
              status: f.status,
              rate: f.rate,
              price: f.price,
            }))}
          />
        </section>
      )}

      <section className="mb-12">
        <h2 className="mb-4 text-xl font-semibold">{dict.project.flatsHeading}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {flats
            .filter((f) => f.status !== "sold")
            .map((f) => (
              <FlatCard key={f.id} flat={f} dict={dict} lang={lang} />
            ))}
        </div>
      </section>

      <div className="grid gap-10 md:grid-cols-2">
        {progress.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-semibold">{dict.project.progress}</h2>
            <ol className="space-y-5 border-l border-line pl-5">
              {progress.map((u) => (
                <li key={u.id} className="relative">
                  <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                  <p className="text-xs text-muted">{formatDate(u.happened_on, lang, { year: "numeric", month: "long", day: "numeric" })}</p>
                  <p className="font-medium">{pick(u.title, lang)}</p>
                  {pick(u.body, lang) && <p className="text-sm text-muted">{pick(u.body, lang)}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 text-xl font-semibold">{dict.home.ctaTitle}</h2>
          <LeadForm projectId={project.id} subject={name} />
        </section>
      </div>
    </div>
  );
}

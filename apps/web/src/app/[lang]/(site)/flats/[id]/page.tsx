import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BuildingExplorer from "@/components/BuildingExplorer";
import FlatCard from "@/components/FlatCard";
import LeadForm from "@/components/LeadForm";
import StatusBadge from "@/components/StatusBadge";
import { getDictionary, getLocale } from "@/i18n/server";
import { fmt, formatArea, formatUsd, pick } from "@/i18n/format";
import { fetchAllFlats, fetchFlat, flatPrice, flatRate } from "@/lib/site";
import { imageUrl } from "@/lib/supabase";
import { isUuid } from "@/lib/validate";
import { languageAlternates } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[lang]/flats/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return {};
  const [lang, dict, detail] = await Promise.all([getLocale(), getDictionary(), fetchFlat(id)]);
  if (!detail) return {};
  return {
    title: `${fmt(dict.flat.title, { n: detail.flat.number })} · ${pick(detail.project.name, lang)} — Developer22`,
    alternates: languageAlternates(`/flats/${id}`, lang),
  };
}

export default async function FlatPage({ params }: PageProps<"/[lang]/flats/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [lang, dict, detail, allFlats] = await Promise.all([getLocale(), getDictionary(), fetchFlat(id), fetchAllFlats()]);
  if (!detail) notFound();
  const { flat, project, views, hotspots } = detail;

  const rate = flatRate(flat, project);
  const price = flatPrice(flat, project);
  const projectName = pick(project.name, lang);
  const projectFlats = allFlats.filter((f) => f.project.id === project.id);
  const similar = projectFlats
    .filter((f) => f.id !== flat.id && f.status === "available" && f.rooms === flat.rooms)
    .slice(0, 4);
  const title = fmt(dict.flat.title, { n: flat.number });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/projects/${project.slug}`} className="text-sm text-accent hover:underline">
        ← {fmt(dict.flat.backToProject, { project: projectName })}
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold">{title}</h1>
            <StatusBadge status={flat.status} />
            <p className="w-full text-muted">{projectName}</p>
          </header>

          <dl className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">{dict.flat.floor}</dt>
              <dd className="text-lg font-medium">{flat.floor}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{dict.flat.rooms}</dt>
              <dd className="text-lg font-medium">{flat.rooms}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{dict.flat.area}</dt>
              <dd className="text-lg font-medium">{formatArea(Number(flat.area_m2), lang)}</dd>
            </div>
            {rate != null && flat.status !== "sold" && (
              <div>
                <dt className="text-xs text-muted">{dict.flat.pricePerM2}</dt>
                <dd className="text-lg font-medium">{formatUsd(rate, lang)}</dd>
              </div>
            )}
          </dl>

          {flat.status === "sold" && <p className="text-muted">{dict.flat.soldNote}</p>}
          {flat.status === "reserved" && <p className="text-muted">{dict.flat.reservedNote}</p>}

          {views.length > 0 && (
            <section>
              <h2 className="mb-3 text-xl font-semibold">{dict.flat.onBuilding}</h2>
              <BuildingExplorer
                views={views.map((v) => ({ ...v, image_path: imageUrl(v.image_path) ?? v.image_path }))}
                hotspots={hotspots}
                highlightFlatId={flat.id}
                flats={projectFlats.map((f) => ({
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
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {price != null && flat.status !== "sold" && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="text-xs text-muted">{dict.flat.price}</p>
              <p className="text-3xl font-semibold text-brand">{fmt(dict.flat.approxTotal, { price: formatUsd(price, lang) })}</p>
              {rate != null && (
                <p className="text-sm text-muted">
                  {fmt(dict.flat.perM2, { price: formatUsd(rate, lang) })} × {formatArea(Number(flat.area_m2), lang)}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">{dict.flat.negotiable}</p>
            </div>
          )}
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-3 text-lg font-semibold">{dict.flat.inquire}</h2>
            <LeadForm projectId={project.id} flatId={flat.id} subject={`${title}, ${projectName}`} />
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">{dict.flat.similar}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((f) => (
              <FlatCard key={f.id} flat={f} dict={dict} lang={lang} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

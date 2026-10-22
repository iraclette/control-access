import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { Locale } from "@/i18n/config";
import { fmt, formatDate, formatUsd, pick } from "@/i18n/format";
import { imageUrl } from "@/lib/supabase";
import type { Project } from "@/lib/site";

type Props = { project: Project; available: number; total: number; dict: Dictionary; lang: Locale };

export default function ProjectCard({ project, available, total, dict, lang }: Props) {
  const cover = imageUrl(project.cover_image);
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:border-accent"
    >
      <div className="relative aspect-[16/10] bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- demo SVGs and storage images are served as-is */}
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />}
        <span className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-brand-fg">
          {dict.project.status[project.status]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-lg font-semibold group-hover:text-accent">{pick(project.name, lang)}</h3>
        <p className="text-sm text-muted">
          {[pick(project.district, lang), pick(project.city, lang)].filter(Boolean).join(", ")}
        </p>
        {project.completion_date && (
          <p className="text-sm text-muted">
            {fmt(project.status === "completed" ? dict.project.completedOn : dict.project.expectedOn, {
              date: formatDate(project.completion_date, lang),
            })}
          </p>
        )}
        <div className="mt-auto space-y-0.5 pt-3 text-sm">
          <p>{fmt(dict.project.availableCount, { n: available, total })}</p>
          {project.price_per_m2_usd != null && (
            <p className="font-medium text-brand">
              {fmt(dict.project.pricePerM2From, { price: formatUsd(project.price_per_m2_usd, lang) })}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

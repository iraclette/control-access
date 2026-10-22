import type { Metadata } from "next";
import Link from "next/link";
import ProjectCard from "@/components/ProjectCard";
import { LogoMark } from "@/components/Logo";
import { getDictionary, getLocale } from "@/i18n/server";
import { fetchAllFlats, fetchProjects } from "@/lib/site";
import { languageAlternates } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: languageAlternates("/", await getLocale()) };
}

export default async function HomePage() {
  const [lang, dict, projects, flats] = await Promise.all([getLocale(), getDictionary(), fetchProjects(), fetchAllFlats()]);

  return (
    <>
      <section className="relative overflow-hidden bg-brand text-brand-fg">
        <LogoMark className="pointer-events-none absolute -right-10 -top-6 h-[28rem] w-[28rem] opacity-10" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-5xl">{dict.home.heroTitle}</h1>
          <p className="mt-4 max-w-xl text-base opacity-90 sm:text-lg">{dict.home.heroText}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/flats" className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-[#0e4158] hover:opacity-90">
              {dict.home.browseFlats}
            </Link>
            <Link href="/projects" className="rounded-lg border border-white/40 px-5 py-2.5 text-sm font-medium hover:bg-white/10">
              {dict.home.ourProjects}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold">{dict.home.ourProjects}</h2>
          <Link href="/projects" className="text-sm text-accent hover:underline">
            {dict.home.allProjects} →
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {projects.map((p) => {
            const own = flats.filter((f) => f.project.id === p.id);
            return (
              <ProjectCard
                key={p.id}
                project={p}
                available={own.filter((f) => f.status === "available").length}
                total={own.length}
                dict={dict}
                lang={lang}
              />
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-6 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold">{dict.home.aboutTitle}</h2>
          <p className="mt-3 text-muted">{dict.home.aboutText}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-xl font-semibold">{dict.home.ctaTitle}</h2>
          <p className="mt-2 text-muted">{dict.home.ctaText}</p>
          <Link href="/contact" className="mt-4 inline-flex rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90">
            {dict.home.ctaButton}
          </Link>
        </div>
      </section>
    </>
  );
}

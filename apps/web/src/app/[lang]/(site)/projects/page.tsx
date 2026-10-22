import type { Metadata } from "next";
import ProjectCard from "@/components/ProjectCard";
import { getDictionary, getLocale } from "@/i18n/server";
import { fetchAllFlats, fetchProjects, type ProjectStatus } from "@/lib/site";
import { languageAlternates } from "@/lib/seo";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const [dict, lang] = await Promise.all([getDictionary(), getLocale()]);
  return { title: dict.meta.projects, alternates: languageAlternates("/projects", lang) };
}

const ORDER: ProjectStatus[] = ["under_construction", "planned", "completed"];

export default async function ProjectsPage() {
  const [lang, dict, projects, flats] = await Promise.all([getLocale(), getDictionary(), fetchProjects(), fetchAllFlats()]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{dict.nav.projects}</h1>
      {ORDER.map((status) => {
        const group = projects.filter((p) => p.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status} className="mt-10">
            <h2 className="mb-4 text-xl font-semibold">{dict.project.status[status]}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((p) => {
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
        );
      })}
    </div>
  );
}

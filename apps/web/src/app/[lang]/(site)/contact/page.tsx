import type { Metadata } from "next";
import LeadForm from "@/components/LeadForm";
import { getDictionary, getLocale } from "@/i18n/server";
import { languageAlternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [dict, lang] = await Promise.all([getDictionary(), getLocale()]);
  return { title: dict.meta.contact, alternates: languageAlternates("/contact", lang) };
}

export default async function ContactPage() {
  const dict = await getDictionary();
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-2">
      <div>
        <h1 className="text-3xl font-semibold">{dict.contact.title}</h1>
        <p className="mt-3 text-muted">{dict.contact.text}</p>
        <div className="mt-8 space-y-4 rounded-xl border border-line bg-surface p-5 text-sm">
          <p className="text-xs text-muted">{dict.contact.placeholderNote}</p>
          <div>
            <p className="font-medium">{dict.contact.salesOffice}</p>
            <p className="text-muted">Gori, Georgia</p>
            <p className="text-muted">{dict.contact.hours}</p>
          </div>
          <div>
            <p className="font-medium">{dict.contact.phoneLabel}</p>
            <p className="text-muted">+995 5XX XX XX XX</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface p-6">
        <LeadForm />
      </div>
    </div>
  );
}

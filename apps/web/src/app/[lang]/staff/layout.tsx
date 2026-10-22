import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";

// Staff pages are client-rendered behind the login in StaffShell; keep them out of search.
export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: `${dict.staff.title} — Developer22`, robots: { index: false, follow: false } };
}

export default function StaffLayout({ children }: LayoutProps<"/[lang]/staff">) {
  return children;
}

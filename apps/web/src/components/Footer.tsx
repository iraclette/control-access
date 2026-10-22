import Link from "next/link";
import Logo from "@/components/Logo";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";

export default async function Footer() {
  const dict = await getDictionary();
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted">{fmt(dict.footer.rights, { year: new Date().getFullYear() })}</p>
        </div>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/projects" className="text-muted hover:text-fg">{dict.nav.projects}</Link>
          <Link href="/flats" className="text-muted hover:text-fg">{dict.nav.flats}</Link>
          <Link href="/contact" className="text-muted hover:text-fg">{dict.nav.contact}</Link>
        </nav>
        <div className="space-y-2 text-sm">
          <p className="font-medium">{dict.footer.follow}</p>
          <a href="https://www.facebook.com/developeri22.ge/" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-fg">
            Facebook
          </a>
        </div>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";
import { Geist, Noto_Sans_Georgian } from "next/font/google";
import { themeInitScript } from "@/components/ThemeToggle";
import { LOCALES } from "@/i18n/config";
import { I18nProvider } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { OG_LOCALES, SITE_URL } from "@/lib/seo";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });
const notoSansGeorgian = Noto_Sans_Georgian({ variable: "--font-noto-sans-georgian", subsets: ["georgian"] });

// Demo builds show a strip saying the flats and prices are placeholders.
const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  return {
    metadataBase: new URL(SITE_URL),
    title: dict.meta.title,
    description: dict.meta.description,
    openGraph: { siteName: "Developer22", type: "website", locale: OG_LOCALES[locale] },
    icons: { icon: "/brand/logo-tile.svg" },
    // Keep the demo out of search engines until the real content is in.
    robots: IS_DEMO ? { index: false, follow: false } : undefined,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const [lang, dict] = await Promise.all([getLocale(), getDictionary()]);

  return (
    <html lang={lang} className={`${geistSans.variable} ${notoSansGeorgian.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <I18nProvider lang={lang} dict={dict}>
          {IS_DEMO && (
            <div className="bg-brand px-4 py-1.5 text-center text-xs text-brand-fg">{dict.demo.banner}</div>
          )}
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}

import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { SITE_URL } from "@/lib/seo";

// Staff tools and the API have nothing for search engines; everything else is open,
// except in demo builds, which stay out of search entirely.
const PRIVATE = ["/staff", "/api"];

export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE, ...LOCALES.flatMap((locale) => PRIVATE.map((path) => `/${locale}${path}`))],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

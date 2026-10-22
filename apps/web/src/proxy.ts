import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LANG_COOKIE, LOCALES, hasLocale, type Locale } from "@/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;

// First language in Accept-Language we have a dictionary for, e.g. "ka-GE,ka;q=0.9,en;q=0.8" -> "ka".
function fromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.split("-")[0].toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return (ranked.find((entry) => hasLocale(entry.lang))?.lang as Locale | undefined) ?? null;
}

// Same scheme as Shelby: URLs stay unprefixed (/flats); the language lives in a cookie and
// every page request is rewritten internally to /<lang>/... A prefixed URL (/ru/flats) is
// served as is and remembers that language: it's what search engines index and what a
// shared language link opens.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const prefix = LOCALES.find((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (prefix) {
    const response = NextResponse.next();
    response.cookies.set(LANG_COOKIE, prefix, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
    return response;
  }

  const cookie = request.cookies.get(LANG_COOKIE)?.value;
  const locale = hasLocale(cookie)
    ? cookie
    : (fromAcceptLanguage(request.headers.get("accept-language")) ?? DEFAULT_LOCALE);

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except API routes, Next internals and files with an extension (images, favicon…).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getDictionary } from "@/i18n/server";

export default async function NotFound() {
  const dict = await getDictionary();
  // Lives outside the (site) group, so it brings the site frame itself.
  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl flex-1 px-4 py-24 text-center">
        <h1 className="text-3xl font-semibold">{dict.errors.notFound}</h1>
        <p className="mt-3 text-muted">{dict.errors.notFoundText}</p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg">
          {dict.errors.backHome}
        </Link>
      </main>
      <Footer />
    </>
  );
}

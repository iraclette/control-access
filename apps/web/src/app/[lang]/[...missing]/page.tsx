import { notFound } from "next/navigation";

// Every URL is rewritten under /[lang] (see proxy.ts), so an unknown path lands here
// and gets the translated 404 from ../not-found.tsx instead of Next's default one.
export default function Missing() {
  notFound();
}

import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { Locale } from "@/i18n/config";
import { fmt, formatArea, formatUsd, pick } from "@/i18n/format";
import StatusBadge from "@/components/StatusBadge";
import type { FlatListing } from "@/lib/site";

export default function FlatCard({ flat, dict, lang }: { flat: FlatListing; dict: Dictionary; lang: Locale }) {
  const forSale = flat.status !== "sold";
  return (
    <Link
      href={`/flats/${flat.id}`}
      className={`flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition hover:border-accent ${forSale ? "" : "opacity-70"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{fmt(dict.flat.title, { n: flat.number })}</p>
          <p className="text-xs text-muted">{pick(flat.project.name, lang)}</p>
        </div>
        <StatusBadge status={flat.status} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">{dict.flat.floor}</dt>
          <dd>{flat.floor}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{dict.flat.rooms}</dt>
          <dd>{flat.rooms}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{dict.flat.area}</dt>
          <dd>{formatArea(flat.area_m2, lang)}</dd>
        </div>
      </dl>
      {forSale && flat.price != null && flat.rate != null && (
        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-line pt-2">
          <span className="text-lg font-semibold text-brand">{fmt(dict.flat.approxTotal, { price: formatUsd(flat.price, lang) })}</span>
          <span className="text-xs text-muted">{fmt(dict.flat.perM2, { price: formatUsd(flat.rate, lang) })}</span>
        </div>
      )}
    </Link>
  );
}

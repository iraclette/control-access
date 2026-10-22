"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { fmt, formatArea, formatUsd, pick } from "@/i18n/format";
import StatusBadge from "@/components/StatusBadge";
import type { BuildingView, FlatStatus, Hotspot } from "@/lib/site";

export type ExplorerFlat = {
  id: string;
  number: string;
  floor: number;
  rooms: number;
  area_m2: number;
  status: FlatStatus;
  rate: number | null;
  price: number | null;
};

type Props = {
  views: BuildingView[];
  hotspots: Hotspot[];
  flats: ExplorerFlat[];
  // Flat page: start with this flat selected and its view open.
  highlightFlatId?: string;
};

// A building image with one SVG polygon per flat on top. Polygons are stored normalised
// (0..1), so the overlay uses a 0..1 viewBox stretched over the image: it stays aligned at
// any size or resolution. Each polygon is a real link: Tab/Enter work, screen readers read
// its label, and on phones the first tap previews the flat and the second opens it.
export default function BuildingExplorer({ views, hotspots, flats, highlightFlatId }: Props) {
  const { lang, dict } = useI18n();
  const router = useRouter();
  const flatById = useMemo(() => new Map(flats.map((f) => [f.id, f])), [flats]);

  const initialView =
    (highlightFlatId && hotspots.find((h) => h.flat_id === highlightFlatId)?.view_id) || views[0]?.id;
  const [viewId, setViewId] = useState(initialView);
  const [activeId, setActiveId] = useState<string | null>(highlightFlatId ?? null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const view = views.find((v) => v.id === viewId);
  if (!view) return null;
  const shapes = hotspots.filter((h) => h.view_id === view.id && flatById.has(h.flat_id));
  const shown = flatById.get(hoverId ?? activeId ?? "") ?? null;

  function label(flat: ExplorerFlat) {
    return fmt(dict.flat.hotspotLabel, {
      n: flat.number,
      floor: flat.floor,
      rooms: flat.rooms,
      area: formatArea(flat.area_m2, lang),
      status: dict.flat.status[flat.status],
    });
  }

  function onShapeClick(event: React.MouseEvent, flatId: string) {
    // Touch has no hover: the first tap selects, a second tap on the same flat opens it.
    const isTouch = (event.nativeEvent as PointerEvent).pointerType === "touch";
    if (isTouch && activeId !== flatId) {
      event.preventDefault();
      setActiveId(flatId);
      return;
    }
    event.preventDefault();
    router.push(`/flats/${flatId}`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {views.length > 1 && (
            <div role="tablist" aria-label={dict.project.views} className="flex gap-1 rounded-lg bg-surface-2 p-1">
              {views.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  type="button"
                  aria-selected={v.id === view.id}
                  onClick={() => setViewId(v.id)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    v.id === view.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                  }`}
                >
                  {pick(v.label, lang) || v.kind}
                </button>
              ))}
            </div>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[var(--accent)]" />
            {dict.project.showAvailability}
          </label>
        </div>

        <div
          className={`relative overflow-hidden rounded-xl border border-line bg-surface-2 ${showAll ? "overlay-all" : ""}`}
          style={{ aspectRatio: `${view.image_width} / ${view.image_height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- plain img: the overlay must match its box exactly */}
          <img src={view.image_path} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            onMouseLeave={() => setHoverId(null)}
          >
            <defs>
              <pattern id="sold-hatch" width="0.012" height="0.012" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="0.012" height="0.012" fill="color-mix(in srgb, var(--sold) 30%, transparent)" />
                <line x1="0" y1="0" x2="0" y2="0.012" stroke="var(--sold)" strokeWidth="0.004" />
              </pattern>
            </defs>
            {shapes.map((h) => {
              const flat = flatById.get(h.flat_id)!;
              return (
                <a
                  key={h.id}
                  href={`/flats/${flat.id}`}
                  className="hotspot"
                  data-status={flat.status}
                  data-active={flat.id === activeId}
                  aria-label={label(flat)}
                  onMouseEnter={() => setHoverId(flat.id)}
                  onFocus={() => setActiveId(flat.id)}
                  onClick={(e) => onShapeClick(e, flat.id)}
                >
                  <title>{label(flat)}</title>
                  <polygon points={h.points.map(([x, y]) => `${x},${y}`).join(" ")} />
                </a>
              );
            })}
          </svg>
        </div>
        <p className="mt-2 text-sm text-muted">{dict.project.exploreHint}</p>
      </div>

      <aside aria-live="polite" className="self-start rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-20">
        {shown ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold">{fmt(dict.flat.title, { n: shown.number })}</h3>
              <StatusBadge status={shown.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">{dict.flat.floor}</dt>
              <dd>{shown.floor}</dd>
              <dt className="text-muted">{dict.flat.rooms}</dt>
              <dd>{shown.rooms}</dd>
              <dt className="text-muted">{dict.flat.area}</dt>
              <dd>{formatArea(shown.area_m2, lang)}</dd>
              {shown.rate != null && shown.status !== "sold" && (
                <>
                  <dt className="text-muted">{dict.flat.pricePerM2}</dt>
                  <dd>{formatUsd(shown.rate, lang)}</dd>
                </>
              )}
            </dl>
            {shown.price != null && shown.status !== "sold" && (
              <p className="text-xl font-semibold text-brand">{fmt(dict.flat.approxTotal, { price: formatUsd(shown.price, lang) })}</p>
            )}
            <Link
              href={`/flats/${shown.id}`}
              className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
            >
              {dict.flat.open}
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted">{dict.project.exploreHint}</p>
        )}
        <ul className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3 text-xs text-muted">
          {(["available", "reserved", "sold"] as const).map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-sm ${s === "available" ? "bg-available" : s === "reserved" ? "bg-reserved" : "bg-sold"}`} />
              {dict.flat.status[s]}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

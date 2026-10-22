"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ClipboardPaste, Pencil, Trash2, Undo2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fmt, pick, type Localized } from "@/i18n/format";
import { getStaffClient } from "@/lib/staffClient";
import { imageUrl } from "@/lib/supabase";
import type { FlatStatus } from "@/lib/site";

type Point = [number, number];
type EditorFlat = { id: string; number: string; floor: number; status: FlatStatus };
type ViewRow = { id: string; building_id: string; label: Localized; kind: string; image_path: string; image_width: number; image_height: number };
type Drag = { kind: "vertex"; index: number } | { kind: "shape"; start: Point; original: Point[] };

const CLOSE_RADIUS_PX = 12;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const round = (v: number) => Math.round(v * 10000) / 10000;
const centroid = (pts: Point[]): Point => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

// Draw/adjust one polygon per flat on a building image. Points are stored normalised (0..1)
// so they survive re-uploads at other resolutions. Handles and labels are HTML positioned
// in %, not SVG shapes, because the 0..1 viewBox is stretched and would squash circles/text.
export default function HotspotEditor({ viewId }: { viewId: string }) {
  const { lang, dict } = useI18n();
  const supabase = getStaffClient();
  const surface = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<ViewRow | null>(null);
  const [flats, setFlats] = useState<EditorFlat[]>([]);
  const [shapes, setShapes] = useState<Record<string, Point[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Point[] | null>(null); // non-null while drawing
  const [drag, setDrag] = useState<Drag | null>(null);
  const [clipboard, setClipboard] = useState<{ points: Point[]; floor: number } | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");

  useEffect(() => {
    (async () => {
      const { data: v } = await supabase
        .from("views")
        .select("id, building_id, label, kind, image_path, image_width, image_height")
        .eq("id", viewId)
        .single();
      if (!v) return;
      const [f, h] = await Promise.all([
        supabase.from("flats").select("id, number, floor, status").eq("building_id", v.building_id),
        supabase.from("hotspots").select("flat_id, points").eq("view_id", viewId),
      ]);
      const list = (f.data ?? []) as EditorFlat[];
      list.sort((a, b) => b.floor - a.floor || a.number.localeCompare(b.number, undefined, { numeric: true }));
      setView(v as ViewRow);
      setFlats(list);
      setShapes(Object.fromEntries(((h.data ?? []) as { flat_id: string; points: Point[] }[]).map((r) => [r.flat_id, r.points])));
    })();
  }, [supabase, viewId]);

  const flatById = useMemo(() => new Map(flats.map((f) => [f.id, f])), [flats]);

  const toPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = surface.current!.getBoundingClientRect();
    return [clamp((clientX - rect.left) / rect.width), clamp((clientY - rect.top) / rect.height)];
  }, []);

  const save = useCallback(
    async (flatId: string, points: Point[]) => {
      const clean = points.map(([x, y]) => [round(x), round(y)] as Point);
      setShapes((s) => ({ ...s, [flatId]: clean }));
      setClipboard({ points: clean, floor: flatById.get(flatId)?.floor ?? 0 });
      setStatus("saving");
      const { error } = await supabase
        .from("hotspots")
        .upsert({ view_id: viewId, flat_id: flatId, points: clean }, { onConflict: "view_id,flat_id" });
      setStatus(error ? "error" : "saved");
    },
    [supabase, viewId, flatById],
  );

  async function remove(flatId: string) {
    setShapes((s) => {
      const next = { ...s };
      delete next[flatId];
      return next;
    });
    setStatus("saving");
    const { error } = await supabase.from("hotspots").delete().eq("view_id", viewId).eq("flat_id", flatId);
    setStatus(error ? "error" : "saved");
  }

  const finish = useCallback(() => {
    if (selected && draft && draft.length >= 3) save(selected, draft);
    setDraft(null);
  }, [selected, draft, save]);

  // Vertical distance between floors on this image, measured from regions already drawn
  // directly above each other (median, so one sloppy shape doesn't skew it).
  function floorPitch(): number | null {
    const marked = Object.entries(shapes).flatMap(([id, pts]) => {
      const flat = flatById.get(id);
      return flat ? [{ floor: flat.floor, c: centroid(pts) }] : [];
    });
    const gaps: number[] = [];
    for (const a of marked)
      for (const b of marked)
        if (b.floor === a.floor + 1 && Math.abs(a.c[0] - b.c[0]) < 0.02) gaps.push(a.c[1] - b.c[1]);
    if (gaps.length === 0) return null;
    gaps.sort((x, y) => x - y);
    return gaps[Math.floor(gaps.length / 2)];
  }

  // Copies the last saved shape onto the selected flat. If that flat is on another floor,
  // the shape moves by one floor pitch per floor: on a facade with stacked identical windows
  // that lands it right on the target flat, so a whole building is marked in minutes.
  // Before any stacked regions exist, the shape's own height stands in for the pitch.
  function paste() {
    if (!clipboard || !selected) return;
    const target = flatById.get(selected);
    const ys = clipboard.points.map(([, y]) => y);
    const pitch = floorPitch() ?? Math.max(...ys) - Math.min(...ys);
    const dy = target ? (clipboard.floor - target.floor) * pitch : 0;
    save(selected, clipboard.points.map(([x, y]) => [x, clamp(y + dy)] as Point));
  }

  function choose(flatId: string) {
    setDraft(null);
    setSelected(flatId);
    if (!shapes[flatId]) setDraft([]); // unmarked flat: start drawing straight away
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest("input, textarea, select")) return;
      if (draft === null) return;
      if (event.key === "Enter") finish();
      else if (event.key === "Escape") setDraft(null);
      else if (event.key === "Backspace") {
        event.preventDefault();
        setDraft((d) => d?.slice(0, -1) ?? null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, finish]);

  function onSurfacePointerDown(event: React.PointerEvent) {
    if (draft === null || !selected) return;
    const point = toPoint(event.clientX, event.clientY);
    if (draft.length >= 3) {
      const rect = surface.current!.getBoundingClientRect();
      const [fx, fy] = draft[0];
      const distance = Math.hypot((point[0] - fx) * rect.width, (point[1] - fy) * rect.height);
      if (distance <= CLOSE_RADIUS_PX) return finish();
    }
    setDraft([...draft, point]);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag || !selected || !shapes[selected]) return;
    const point = toPoint(event.clientX, event.clientY);
    if (drag.kind === "vertex") {
      setShapes((s) => ({ ...s, [selected]: s[selected].map((p, i) => (i === drag.index ? point : p)) }));
    } else {
      const dx = point[0] - drag.start[0];
      const dy = point[1] - drag.start[1];
      setShapes((s) => ({ ...s, [selected]: drag.original.map(([x, y]) => [clamp(x + dx), clamp(y + dy)] as Point) }));
    }
  }

  function onPointerUp() {
    if (drag && selected && shapes[selected]) save(selected, shapes[selected]);
    setDrag(null);
  }

  if (!view) return <p className="text-muted">{dict.staff.common.loading}</p>;

  const selectedFlat = selected ? flatById.get(selected) : null;
  const selectedShape = selected ? shapes[selected] : undefined;
  const marked = flats.filter((f) => shapes[f.id]).length;
  const shown = flats.filter((f) => !query.trim() || f.number.includes(query.trim()));
  const statusText = status === "saving" ? dict.staff.common.saving : status === "saved" ? dict.staff.common.saved : status === "error" ? dict.staff.common.saveFailed : "";
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent disabled:opacity-40";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/staff/views" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {dict.staff.editor.back}
        </Link>
        <h1 className="text-xl font-semibold">{pick(view.label, lang) || view.kind}</h1>
        <span className="text-sm text-muted">{fmt(dict.staff.views.regions, { n: marked, total: flats.length })}</span>
        <span role="status" className={`ml-auto text-sm ${status === "error" ? "text-red-600" : "text-muted"}`}>{statusText}</span>
      </div>
      <p className="text-sm text-muted">{dict.staff.editor.help}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {selectedFlat ? <span className="font-medium">{fmt(dict.flat.title, { n: selectedFlat.number })}</span> : null}
            {draft !== null ? (
              <>
                <button type="button" onClick={finish} disabled={draft.length < 3} className={btn}><Check className="h-4 w-4" /> {dict.staff.editor.finish}</button>
                <button type="button" onClick={() => setDraft((d) => d?.slice(0, -1) ?? null)} disabled={!draft.length} className={btn}><Undo2 className="h-4 w-4" /> {dict.staff.editor.undoPoint}</button>
                <button type="button" onClick={() => setDraft(null)} className={btn}>{dict.staff.common.cancel}</button>
              </>
            ) : selected ? (
              <>
                <button type="button" onClick={() => setDraft([])} className={btn}><Pencil className="h-4 w-4" /> {selectedShape ? dict.staff.editor.redraw : dict.staff.editor.draw}</button>
                {selectedShape && <button type="button" onClick={() => remove(selected)} className={`${btn} text-red-600`}><Trash2 className="h-4 w-4" /> {dict.staff.editor.remove}</button>}
              </>
            ) : null}
            <button type="button" onClick={paste} disabled={!clipboard || !selected} className={btn}><ClipboardPaste className="h-4 w-4" /> {dict.staff.editor.pasteShape}</button>
            <span className="text-xs text-muted">{dict.staff.editor.keys}</span>
          </div>

          <div
            ref={surface}
            className={`relative touch-none select-none overflow-hidden rounded-xl border border-line bg-surface-2 ${draft !== null ? "cursor-crosshair" : ""}`}
            style={{ aspectRatio: `${view.image_width} / ${view.image_height}` }}
            onPointerDown={onSurfacePointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the overlay must match the image box exactly */}
            <img src={imageUrl(view.image_path) ?? ""} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {Object.entries(shapes).map(([flatId, pts]) => {
                const isSelected = flatId === selected && draft === null;
                return (
                  <polygon
                    key={flatId}
                    points={pts.map((p) => p.join(",")).join(" ")}
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    className={isSelected ? "cursor-move fill-[color-mix(in_srgb,var(--accent)_35%,transparent)] stroke-[var(--accent)]" : "fill-[color-mix(in_srgb,var(--brand)_18%,transparent)] stroke-[var(--brand)]"}
                    onPointerDown={(event) => {
                      if (draft !== null) return;
                      event.stopPropagation();
                      if (flatId !== selected) return setSelected(flatId);
                      (event.target as Element).setPointerCapture?.(event.pointerId);
                      setDrag({ kind: "shape", start: toPoint(event.clientX, event.clientY), original: pts });
                    }}
                  />
                );
              })}
              {draft && draft.length > 0 && (
                <polyline
                  points={draft.map((p) => p.join(",")).join(" ")}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={2}
                  className="fill-[color-mix(in_srgb,var(--accent)_20%,transparent)] stroke-[var(--accent)]"
                />
              )}
            </svg>

            {/* Flat numbers on every marked region, so staff can see what's done. */}
            {Object.entries(shapes).map(([flatId, pts]) => {
              const [cx, cy] = centroid(pts);
              return (
                <span key={`label-${flatId}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-black/55 px-1 text-[10px] font-medium text-white" style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}>
                  {flatById.get(flatId)?.number}
                </span>
              );
            })}

            {/* Vertex handles: of the shape being drawn, or of the selected shape. */}
            {(draft ?? selectedShape ?? []).map(([x, y], index) => (
              <span
                key={index}
                className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${draft !== null && index === 0 ? "bg-available" : "bg-[var(--accent)]"} ${draft === null ? "cursor-grab" : ""}`}
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                onPointerDown={(event) => {
                  if (draft !== null) return; // while drawing, clicks go to the surface (first point closes)
                  event.stopPropagation();
                  (event.target as Element).setPointerCapture?.(event.pointerId);
                  setDrag({ kind: "vertex", index });
                }}
              />
            ))}
          </div>
        </div>

        <aside className="rounded-xl border border-line bg-surface p-3 lg:max-h-[75vh] lg:overflow-y-auto">
          <p className="mb-2 font-medium">{dict.staff.editor.flats}</p>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={dict.staff.editor.search} inputMode="numeric" className="mb-2 w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm" />
          <ul className="space-y-1">
            {shown.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => choose(f.id)}
                  aria-pressed={f.id === selected}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${f.id === selected ? "bg-brand text-brand-fg" : "hover:bg-surface-2"}`}
                >
                  <span>
                    {fmt(dict.flat.title, { n: f.number })} <span className="opacity-70">· {f.floor}</span>
                  </span>
                  <span className={`text-xs ${f.id === selected ? "" : shapes[f.id] ? "text-available" : "text-muted"}`}>
                    {shapes[f.id] ? dict.staff.editor.marked : dict.staff.editor.notMarked}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import StaffShell, { type StaffContext } from "@/components/staff/StaffShell";
import { useI18n } from "@/i18n/client";
import { fmt, formatDate } from "@/i18n/format";

type Overview = {
  buildings: number;
  flats: number;
  flats_with_pin: number;
  flats_disabled: number;
  tags: number;
  tags_enabled: number;
  devices: Record<string, number>;
  devices_disabled: number;
  pending_scans: number;
  sync_version: number;
  sync_updated_at: string | null;
};
type Device = {
  device_id: string;
  device_type: string | null;
  building_name: string | null;
  enabled: boolean;
  unlock_ms: number;
  fw_current_version: string | null;
  fw_active_version: string | null;
  update_pending: boolean;
};
type Release = { id: number; device_type: string; version: string; sha256: string; size_bytes: number | null; active: boolean; created_at: string | null; devices_running: number };
type Building = { id: number; name: string; elevator_pin_enabled: boolean; flats: number; devices: number };
type Scan = { id: number; device_id: string | null; already_assigned_to: string | null; last_seen_at: string | null };
type Data = { overview: Overview; devices: Device[]; firmware: Release[]; buildings: Building[]; scans: Scan[] };

export default function DevConsolePage() {
  return <StaffShell>{(ctx) => <DevConsole ctx={ctx} />}</StaffShell>;
}

function DevConsole({ ctx }: { ctx: StaffContext }) {
  const { lang, dict } = useI18n();
  const t = dict.staff.dev;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const get = async (endpoint: string) => {
        const res = await fetch(`/api/dev/${endpoint}`, { headers: { Authorization: `Bearer ${ctx.session.access_token}` }, cache: "no-store" });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? `HTTP ${res.status}`);
        return res.json();
      };
      const [overview, devices, firmware, buildings, scans] = await Promise.all(["overview", "devices", "firmware", "buildings", "scans"].map(get));
      setData({ overview, devices, firmware, buildings, scans });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [ctx.session.access_token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the backend once on mount
    if (ctx.role === "dev") load();
  }, [ctx.role, load]);

  if (ctx.role !== "dev") return <p className="text-muted">{t.devOnly}</p>;

  const when = (iso: string | null) => (iso ? formatDate(iso, lang, { dateStyle: "medium", timeStyle: "short" }) : "—");
  const card = "rounded-xl border border-line bg-surface";
  const th = "px-3 py-2 text-left font-normal text-muted";
  const td = "px-3 py-2";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-muted">{t.readOnly}</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" /> {t.refresh}
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-600 p-4 text-sm text-red-600">{fmt(t.unavailable, { detail: error })}</p>}
      {!data && !error && <p className="text-muted">{dict.staff.common.loading}</p>}

      {data && (
        <>
          <section aria-label={t.overview} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t.flats} value={data.overview.flats} sub={`${data.overview.flats_with_pin} ${t.flatsWithPin} · ${data.overview.flats_disabled} ${t.flatsDisabled}`} />
            <Stat label={t.tags} value={data.overview.tags} sub={`${data.overview.tags_enabled} ${t.tagsEnabled}`} />
            <Stat
              label={t.devices}
              value={Object.values(data.overview.devices).reduce((a, b) => a + b, 0)}
              sub={Object.entries(data.overview.devices).map(([k, v]) => `${v} ${k}`).join(" · ") + (data.overview.devices_disabled ? ` · ${data.overview.devices_disabled} ${t.devicesDisabled}` : "")}
            />
            <Stat label={t.syncVersion} value={data.overview.sync_version} sub={data.overview.sync_updated_at ? fmt(t.changedAt, { date: when(data.overview.sync_updated_at) }) : ""} />
          </section>

          <section className={card}>
            <h2 className="border-b border-line px-4 py-3 font-medium">{t.devicesTitle}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>{t.device}</th>
                    <th className={th}>{t.type}</th>
                    <th className={th}>{t.building}</th>
                    <th className={th}>{t.firmware}</th>
                    <th className={th}>{t.unlock}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.devices.map((d) => (
                    <tr key={d.device_id} className="border-t border-line">
                      <td className={`${td} font-mono text-xs`}>
                        {d.device_id}
                        {!d.enabled && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 font-sans text-[10px] text-white">{t.disabled}</span>}
                      </td>
                      <td className={td}>{d.device_type ?? "—"}</td>
                      <td className={td}>{d.building_name ?? "—"}</td>
                      <td className={td}>
                        <span className="font-mono text-xs">{d.fw_current_version ?? "?"}</span>{" "}
                        <span className={`text-xs ${d.update_pending ? "text-reserved" : "text-muted"}`}>
                          {d.update_pending ? fmt(t.updatePending, { version: d.fw_active_version ?? "" }) : d.fw_active_version ? t.upToDate : t.noRelease}
                        </span>
                      </td>
                      <td className={td}>{(d.unlock_ms / 1000).toLocaleString(lang)} s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className={card}>
              <h2 className="border-b border-line px-4 py-3 font-medium">{t.firmwareTitle}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className={th}>{t.type}</th>
                      <th className={th}>{t.version}</th>
                      <th className={th}>{t.size}</th>
                      <th className={th}>{t.running}</th>
                      <th className={th}>{t.uploaded}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.firmware.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className={td}>{r.device_type}</td>
                        <td className={td}>
                          <span className="font-mono text-xs" title={r.sha256}>{r.version}</span>
                          {r.active && <span className="ml-2 rounded bg-available px-1.5 py-0.5 text-[10px] text-white">{t.active}</span>}
                        </td>
                        <td className={td}>{r.size_bytes != null ? `${Math.round(r.size_bytes / 1024).toLocaleString(lang)} KB` : "—"}</td>
                        <td className={td}>{r.devices_running}</td>
                        <td className={`${td} text-xs text-muted`}>{when(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="space-y-6">
              <section className={card}>
                <h2 className="border-b border-line px-4 py-3 font-medium">{t.buildingsTitle}</h2>
                <ul className="divide-y divide-line text-sm">
                  {data.buildings.map((b) => (
                    <li key={b.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-muted">
                        {b.flats} {t.flats.toLowerCase()} · {b.devices} {t.devices.toLowerCase()} · {t.elevatorPin}: {b.elevator_pin_enabled ? t.on : t.off}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className={card}>
                <h2 className="border-b border-line px-4 py-3 font-medium">
                  {t.scansTitle} <span className="text-muted">({data.scans.length})</span>
                </h2>
                <ul className="divide-y divide-line text-sm">
                  {data.scans.map((s) => (
                    <li key={s.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                      <span>{s.already_assigned_to ? fmt(t.assignedTo, { flat: s.already_assigned_to }) : t.newTag}</span>
                      <span className="text-xs text-muted">
                        {t.scanDevice} <span className="font-mono">{s.device_id ?? "?"}</span> · {when(s.last_seen_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          <section className={`${card} p-4 text-sm`}>
            <h2 className="mb-2 font-medium">{t.gapsTitle}</h2>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>{t.gapLastSeen}</li>
              <li>{t.gapAccessLog}</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

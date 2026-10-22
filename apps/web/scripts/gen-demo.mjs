// Generates the demo content: placeholder facade drawings (public/demo/*.svg) and
// supabase/seed.sql with matching projects, flats and hotspot polygons.
// The project list is the company's real one; every flat, price and drawing is fake.
//
//   node scripts/gen-demo.mjs        (then `supabase db reset` to load it)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const demoDir = join(webRoot, "public", "demo");
const seedFile = join(webRoot, "..", "..", "supabase", "seed.sql");

// Deterministic so regenerating doesn't reshuffle statuses between runs.
let seed = 22;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

let idCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${(++idCounter).toString(16).padStart(12, "0")}`;

const W = 1600;
const H = 1000;
const round = (n) => Math.round(n * 10000) / 10000;

const projects = [
  {
    slug: "gori-residence-1",
    name: { ka: "გორის რეზიდენცია I", en: "Gori Residence I", ru: "Резиденция Гори I" },
    city: { ka: "გორი", en: "Gori", ru: "Гори" },
    district: { ka: "ცენტრი", en: "Centre", ru: "Центр" },
    status: "completed",
    completion: "2025-06-30",
    rate: 720,
    floors: 10,
    sold: 0.86,
    reserved: 0.05,
    palette: { wall: "#d9d4cb", trim: "#b9b1a4", glass: "#6f8fa6" },
  },
  {
    slug: "gori-residence-2",
    name: { ka: "გორის რეზიდენცია II", en: "Gori Residence II", ru: "Резиденция Гори II" },
    city: { ka: "გორი", en: "Gori", ru: "Гори" },
    district: { ka: "ცენტრი", en: "Centre", ru: "Центр" },
    status: "under_construction",
    completion: "2027-09-30",
    rate: 680,
    floors: 12,
    sold: 0.32,
    reserved: 0.1,
    palette: { wall: "#e4e0d8", trim: "#0e4158", glass: "#7f9fb5" },
  },
  {
    slug: "varketili-residence",
    name: { ka: "ვარკეთილის რეზიდენცია", en: "Varketili Residence", ru: "Резиденция Варкетили" },
    city: { ka: "თბილისი", en: "Tbilisi", ru: "Тбилиси" },
    district: { ka: "ვარკეთილი", en: "Varketili", ru: "Варкетили" },
    status: "under_construction",
    completion: "2027-12-31",
    rate: 890,
    floors: 14,
    sold: 0.28,
    reserved: 0.08,
    palette: { wall: "#cfd6dc", trim: "#5d6f7d", glass: "#6b8ca3" },
  },
  {
    slug: "gldanula-residence",
    name: { ka: "გლდანულას რეზიდენცია", en: "Gldanula Residence", ru: "Резиденция Глданула" },
    city: { ka: "თბილისი", en: "Tbilisi", ru: "Тбилиси" },
    district: { ka: "გლდანულა", en: "Gldanula", ru: "Глданула" },
    status: "under_construction",
    completion: "2028-06-30",
    rate: 760,
    floors: 11,
    sold: 0.2,
    reserved: 0.07,
    palette: { wall: "#e6ddd0", trim: "#8a6f52", glass: "#7a97ad" },
  },
];

// Four flats per floor: two face the front view, two the side view.
const layouts = [
  { suffix: 1, rooms: 3, area: 88, face: "front", slot: 0 },
  { suffix: 2, rooms: 2, area: 64, face: "front", slot: 1 },
  { suffix: 3, rooms: 1, area: 42, face: "side", slot: 0 },
  { suffix: 4, rooms: 4, area: 112, face: "side", slot: 1 },
];

const svgHeader = (title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f1"/><stop offset="1" stop-color="#eef4f8"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect y="${H - 90}" width="${W}" height="90" fill="#b9c2a5"/>
<rect y="${H - 90}" width="${W}" height="10" fill="#9aa585"/>
`;

const watermark = `<text x="${W - 24}" y="${H - 28}" text-anchor="end" font-family="sans-serif" font-size="22" fill="#000" fill-opacity=".35">DEMO RENDER · Developer22</text>\n`;

const poly = (pts, attrs) => `<polygon points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" ${attrs}/>`;

function trees(y) {
  let out = "";
  for (const x of [120, 220, 1380, 1490]) {
    out += `<rect x="${x - 5}" y="${y - 70}" width="10" height="70" fill="#6d5a45"/>`;
    out += `<circle cx="${x}" cy="${y - 95}" r="42" fill="#7d9a6a"/><circle cx="${x - 22}" cy="${y - 75}" r="28" fill="#6f8d5d"/>\n`;
  }
  return out;
}

// Front: a flat elevation. Returns the drawing and each flat's region polygon (pixels).
function frontView(p) {
  const left = 420;
  const right = 1180;
  const ground = H - 90;
  const lobby = 70;
  const fh = Math.min(62, (ground - lobby - 90) / p.floors);
  const top = ground - lobby - p.floors * fh;
  const regions = {};
  let svg = svgHeader(`${p.name.en} front`);
  svg += trees(ground);
  svg += `<rect x="${left - 14}" y="${top - 22}" width="${right - left + 28}" height="22" fill="${p.palette.trim}"/>`;
  svg += `<rect x="${left}" y="${top}" width="${right - left}" height="${ground - top}" fill="${p.palette.wall}"/>`;
  svg += `<rect x="${left}" y="${ground - lobby}" width="${right - left}" height="${lobby}" fill="${p.palette.trim}" fill-opacity=".55"/>`;
  svg += `<rect x="${(left + right) / 2 - 45}" y="${ground - 58}" width="90" height="58" fill="${p.palette.glass}"/>`;
  const half = (right - left) / 2;
  for (let f = 1; f <= p.floors; f++) {
    const y1 = ground - lobby - (f - 1) * fh;
    const y0 = y1 - fh;
    for (const slot of [0, 1]) {
      const x0 = left + slot * half;
      const x1 = x0 + half;
      const pad = 10;
      regions[`${f}:front:${slot}`] = [[x0 + pad, y0 + 4], [x1 - pad, y0 + 4], [x1 - pad, y1 - 4], [x0 + pad, y1 - 4]];
      const winW = (half - 2 * pad - 30) / 3;
      for (let i = 0; i < 3; i++) {
        const wx = x0 + pad + 10 + i * (winW + 5);
        svg += `<rect x="${wx.toFixed(1)}" y="${(y0 + 10).toFixed(1)}" width="${winW.toFixed(1)}" height="${(fh - 20).toFixed(1)}" fill="${p.palette.glass}"/>`;
        svg += `<rect x="${wx.toFixed(1)}" y="${(y0 + 10).toFixed(1)}" width="${winW.toFixed(1)}" height="${(fh - 20).toFixed(1)}" fill="url(#glass)"/>`;
      }
      svg += `<rect x="${(x0 + pad + 6).toFixed(1)}" y="${(y1 - 16).toFixed(1)}" width="${(half - 2 * pad - 12).toFixed(1)}" height="4" fill="${p.palette.trim}"/>`;
    }
    svg += `<rect x="${left}" y="${(y0 - 2).toFixed(1)}" width="${right - left}" height="3" fill="${p.palette.trim}" fill-opacity=".6"/>\n`;
  }
  if (p.status === "under_construction") svg += crane(right + 70, top - 40, ground);
  svg += watermark + "</svg>\n";
  return { svg, regions };
}

// Side: the same building in two-point-ish perspective, so polygons are real quads.
function sideView(p) {
  const nearX = 360;
  const farX = 1240;
  const ground = H - 90;
  const nearH = Math.min(760, 70 + p.floors * 62);
  const farH = nearH * 0.72;
  const nearTop = ground - nearH;
  const farTop = ground - 40 - farH;
  const farBottom = ground - 40;
  const lerp = (a, b, t) => a + (b - a) * t;
  const at = (u, v) => {
    // u: 0 near → 1 far along the wall, v: 0 bottom → 1 top
    const x = lerp(nearX, farX, u);
    const bottom = lerp(ground, farBottom, u);
    const top = lerp(nearTop, farTop, u);
    return [x, lerp(bottom, top, v)];
  };
  const lobbyV = 70 / nearH;
  const floorV = (1 - lobbyV) / p.floors;
  const regions = {};
  let svg = svgHeader(`${p.name.en} side`);
  svg += trees(ground);
  svg += poly([[nearX - 140, nearTop + 30], [nearX, nearTop], [nearX, ground], [nearX - 140, ground - 12]], `fill="${p.palette.trim}" fill-opacity=".7"`);
  svg += poly([at(0, 0), at(1, 0), at(1, 1), at(0, 1)], `fill="${p.palette.wall}"`);
  svg += poly([at(0, 0), at(1, 0), at(1, lobbyV), at(0, lobbyV)], `fill="${p.palette.trim}" fill-opacity=".55"`);
  for (let f = 1; f <= p.floors; f++) {
    const v0 = lobbyV + (f - 1) * floorV;
    const v1 = v0 + floorV;
    for (const slot of [0, 1]) {
      const u0 = slot * 0.5 + 0.02;
      const u1 = slot * 0.5 + 0.48;
      regions[`${f}:side:${slot}`] = [at(u0, v1 - 0.004), at(u1, v1 - 0.004), at(u1, v0 + 0.004), at(u0, v0 + 0.004)];
      for (let i = 0; i < 3; i++) {
        const a = u0 + 0.03 + i * 0.145;
        const b = a + 0.12;
        const quad = [at(a, v1 - floorV * 0.2), at(b, v1 - floorV * 0.2), at(b, v0 + floorV * 0.22), at(a, v0 + floorV * 0.22)];
        svg += poly(quad, `fill="${p.palette.glass}"`) + poly(quad, `fill="url(#glass)"`);
      }
    }
    svg += poly([at(0, v0), at(1, v0), at(1, v0 + 0.003), at(0, v0 + 0.003)], `fill="${p.palette.trim}" fill-opacity=".6"`) + "\n";
  }
  if (p.status === "under_construction") svg += crane(farX + 90, farTop - 60, ground);
  svg += watermark + "</svg>\n";
  return { svg, regions };
}

function crane(x, top, ground) {
  return `<g stroke="#e0a526" stroke-width="6" fill="none"><line x1="${x}" y1="${ground}" x2="${x}" y2="${top}"/><line x1="${x - 220}" y1="${top + 10}" x2="${x + 80}" y2="${top + 10}"/><line x1="${x}" y1="${top - 30}" x2="${x - 220}" y2="${top + 10}"/><line x1="${x - 150}" y1="${top + 10}" x2="${x - 150}" y2="${top + 120}" stroke-width="2"/></g>\n`;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const j = (o) => `${q(JSON.stringify(o))}::jsonb`;

const progressTemplates = [
  { months: -14, title: { ka: "მშენებლობა დაიწყო", en: "Construction started", ru: "Начало строительства" }, body: { ka: "დასრულდა საძირკვლის სამუშაოები.", en: "Foundation works are complete.", ru: "Работы по фундаменту завершены." } },
  { months: -7, title: { ka: "კარკასი — ნახევარი", en: "Frame halfway up", ru: "Каркас — половина" }, body: { ka: "აშენებულია სართულების ნახევარი.", en: "Half of the floors are built.", ru: "Построена половина этажей." } },
  { months: -1, title: { ka: "კარკასი დასრულდა", en: "Frame complete", ru: "Каркас завершён" }, body: { ka: "იწყება ფასადისა და შიდა სამუშაოები.", en: "Facade and interior works are starting.", ru: "Начинаются фасадные и внутренние работы." } },
];

const addMonths = (iso, m) => {
  const d = new Date("2026-10-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
};

mkdirSync(demoDir, { recursive: true });
const sql = [
  "-- Generated by apps/web/scripts/gen-demo.mjs. Real project list, FAKE flats/prices/drawings.",
  "-- Loaded by `supabase db reset` (local only). Never run against production.",
  "",
];

projects.forEach((p, pi) => {
  const projectId = uuid();
  const buildingId = uuid();
  const front = frontView(p);
  const side = sideView(p);
  writeFileSync(join(demoDir, `${p.slug}-front.svg`), front.svg);
  writeFileSync(join(demoDir, `${p.slug}-side.svg`), side.svg);

  const summary = {
    ka: `${p.floors}-სართულიანი საცხოვრებელი კორპუსი, ${p.district.ka}.`,
    en: `A ${p.floors}-storey residential building in ${p.district.en}.`,
    ru: `${p.floors}-этажный жилой дом, ${p.district.ru}.`,
  };
  const description = {
    ka: "სადემონსტრაციო ტექსტი. ბინები, ფასები და გამოსახულებები შემთხვევითია და ცვლის რეალურ მონაცემებს, სანამ ისინი დაემატება.",
    en: "Demo text. Flats, prices and images are placeholders until the real data is added.",
    ru: "Демонстрационный текст. Квартиры, цены и изображения временные, до добавления реальных данных.",
  };
  sql.push(
    `insert into site.projects (id, slug, name, city, district, address, summary, description, status, completion_date, price_per_m2_usd, cover_image, sort_order, published) values (${q(projectId)}, ${q(p.slug)}, ${j(p.name)}, ${j(p.city)}, ${j(p.district)}, ${j({})}, ${j(summary)}, ${j(description)}, ${q(p.status)}, ${q(p.completion)}, ${p.rate}, ${q(`/demo/${p.slug}-front.svg`)}, ${pi}, true);`,
    `insert into site.buildings (id, project_id, name, floors) values (${q(buildingId)}, ${q(projectId)}, ${j({ ka: "კორპუსი A", en: "Building A", ru: "Корпус A" })}, ${p.floors});`,
  );

  const frontViewId = uuid();
  const sideViewId = uuid();
  sql.push(
    `insert into site.views (id, building_id, kind, label, image_path, image_width, image_height, sort_order) values (${q(frontViewId)}, ${q(buildingId)}, 'front', ${j({ ka: "წინა ფასადი", en: "Front", ru: "Фасад" })}, ${q(`/demo/${p.slug}-front.svg`)}, ${W}, ${H}, 0);`,
    `insert into site.views (id, building_id, kind, label, image_path, image_width, image_height, sort_order) values (${q(sideViewId)}, ${q(buildingId)}, 'side', ${j({ ka: "გვერდითი ხედი", en: "Side", ru: "Сбоку" })}, ${q(`/demo/${p.slug}-side.svg`)}, ${W}, ${H}, 1);`,
  );

  for (let f = 1; f <= p.floors; f++) {
    for (const l of layouts) {
      const flatId = uuid();
      const r = rand();
      // Lower floors sell first, like they usually do.
      const bias = (f / p.floors) * 0.25;
      const status = r < p.sold - bias + 0.12 ? "sold" : r < p.sold - bias + 0.12 + p.reserved ? "reserved" : "available";
      const area = Math.round((l.area + (rand() - 0.5) * 6) * 10) / 10;
      const premium = f >= p.floors - 1 ? 40 : 0; // top floors a bit dearer
      const number = String((f - 1) * layouts.length + l.suffix);
      sql.push(
        `insert into site.flats (id, building_id, number, floor, rooms, area_m2, price_per_m2_usd, status) values (${q(flatId)}, ${q(buildingId)}, ${q(number)}, ${f}, ${l.rooms}, ${area}, ${premium ? p.rate + premium : "null"}, ${q(status)});`,
      );
      const region = (l.face === "front" ? front : side).regions[`${f}:${l.face}:${l.slot}`];
      const points = region.map(([x, y]) => [round(x / W), round(y / H)]);
      sql.push(
        `insert into site.hotspots (view_id, flat_id, points) values (${q(l.face === "front" ? frontViewId : sideViewId)}, ${q(flatId)}, ${j(points)});`,
      );
    }
  }

  if (p.status === "under_construction") {
    for (const t of progressTemplates) {
      sql.push(
        `insert into site.progress_updates (project_id, happened_on, title, body) values (${q(projectId)}, ${q(addMonths(null, t.months - pi))}, ${j(t.title)}, ${j(t.body)});`,
      );
    }
  }
  sql.push("");
});

writeFileSync(seedFile, sql.join("\n"));
console.log(`wrote ${projects.length * 2} drawings to public/demo and ${seedFile}`);

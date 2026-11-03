import qrcode from "qrcode-generator";
import { BRAND, bunny, bunnyWithRings } from "@/lib/brand/logo";
import { PAGE_CARDS, type PageKey } from "@/lib/page-cards";
import type { Locale } from "@/lib/i18n";

/**
 * Deel-kaarten per pagina, volledig in code getekend (1200x630): echte
 * typografie, het officiële konijn en echte QR-codes. Eén vaste kaart per
 * pagina per taal — geen rotatie, zodat crawler-caches altijd kloppen.
 */
const W = 1200;
const H = 630;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Breekt tekst op woorden in regels van max `max` tekens. */
function wrap(text: string, max: number, lines = 3) {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    if ((cur + " " + word).trim().length > max && cur) {
      out.push(cur);
      cur = word;
    } else cur = (cur + " " + word).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return out;
}

function textBlock(lines: string[], x: number, y: number, size: number, color: string, weight = 600, lh = 1.12, anchor = "start") {
  return lines
    .map((l, i) => `<text x="${x}" y="${y + i * size * lh}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="${weight >= 600 ? -size * 0.025 : 0}">${esc(l)}</text>`)
    .join("");
}

function headline(t: string) {
  return t.split(/\s[—|]\s/)[0].replace(/\s*\|\s*ROUT$/, "");
}
function tagline(t: string) {
  const parts = t.split(/\s—\s/);
  return parts[1] ?? "";
}

function footer(color: string, muted: string, label = "rout.be") {
  return `${bunny(72, 548, 30, color)}<text x="112" y="574" font-size="24" font-weight="600" fill="${color}" letter-spacing="-0.5">ROUT</text><text x="${W - 72}" y="574" font-size="22" fill="${muted}" text-anchor="end">${esc(label)}</text>`;
}

function qrPath(data: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  const n = qr.getModuleCount();
  const m = size / n;
  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${(x + c * m).toFixed(2)} ${(y + r * m).toFixed(2)}h${m.toFixed(2)}v${m.toFixed(2)}h-${m.toFixed(2)}z`;
  return d;
}

type Ctx = { title: string; desc: string; path: string };

const TEMPLATES: Record<PageKey, (c: Ctx) => string> = {
  home: ({ title, desc }) => {
    const gold = "#C9A84C";
    const qx = 760, qy = 135, qs = 360;
    return `<rect width="${W}" height="${H}" fill="#0E0D0C"/>
<radialGradient id="g" cx="78%" cy="45%" r="55%"><stop offset="0" stop-color="${gold}" stop-opacity=".22"/><stop offset="1" stop-color="${gold}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#g)"/>
<rect x="${qx - 28}" y="${qy - 28}" width="${qs + 56}" height="${qs + 56}" rx="36" fill="#F7F3EA"/>
<path d="${qrPath("https://rout.be", qx, qy, qs)}" fill="#0E0D0C"/>
<rect x="${qx + qs / 2 - 46}" y="${qy + qs / 2 - 52}" width="92" height="104" rx="18" fill="#F7F3EA"/>${bunny(qx + qs / 2 - 32, qy + qs / 2 - 40, 64, "#0E0D0C")}
<text x="72" y="118" font-size="20" font-weight="600" fill="${gold}" letter-spacing="4">QR · LINKS · PROFILE</text>
${textBlock(wrap(tagline(title) || headline(title), 18, 3), 72, 210, 64, "#F7F3EA")}
${textBlock(wrap(desc, 44, 3), 72, 430, 24, "#A8A196", 400, 1.4)}
${footer("#F7F3EA", "#7A746B")}`;
  },
  about: ({ title, desc }) => `<rect width="${W}" height="${H}" fill="#F4EFE3"/>
<line x1="72" y1="96" x2="${W - 72}" y2="96" stroke="#131211" stroke-width="2"/>
<text x="72" y="80" font-size="18" font-weight="600" fill="#131211" letter-spacing="4">MANIFEST</text><text x="${W - 72}" y="80" font-size="18" fill="#6B6458" text-anchor="end" letter-spacing="4">EST. EUROPE</text>
${textBlock(wrap(tagline(title) || headline(title), 16, 3), 72, 210, 92, "#131211", 600, 1.0)}
${textBlock(wrap(desc, 44, 3), 72, 440, 22, "#5C564B", 400, 1.4)}
${bunnyWithRings(990, 340, 130, BRAND.ink, "#FFFFFF")}
${footer("#131211", "#6B6458")}`,
  explore: ({ title, desc }) => {
    const cards = [
      { x: 700, y: 70, r: -6, c: "#41DB97", bg: "#0F2A1F" },
      { x: 860, y: 150, r: 5, c: "#F2725A", bg: "#2A1410" },
      { x: 690, y: 320, r: 4, c: "#7026E1", bg: "#1B1030" },
      { x: 880, y: 360, r: -4, c: "#C9A84C", bg: "#26200F" },
    ];
    const card = (k: (typeof cards)[number]) =>
      `<g transform="rotate(${k.r} ${k.x + 110} ${k.y + 80})"><rect x="${k.x}" y="${k.y}" width="220" height="170" rx="22" fill="${k.bg}" stroke="${k.c}" stroke-opacity=".5"/><circle cx="${k.x + 44}" cy="${k.y + 46}" r="22" fill="${k.c}"/><rect x="${k.x + 78}" y="${k.y + 34}" width="110" height="12" rx="6" fill="#EDEDED"/><rect x="${k.x + 78}" y="${k.y + 54}" width="70" height="9" rx="4.5" fill="#8A8A8A"/><rect x="${k.x + 22}" y="${k.y + 94}" width="176" height="26" rx="13" fill="${k.c}" fill-opacity=".9"/><rect x="${k.x + 22}" y="${k.y + 128}" width="176" height="26" rx="13" fill="#FFFFFF" fill-opacity=".1"/></g>`;
    return `<rect width="${W}" height="${H}" fill="#0B1411"/>${cards.map(card).join("")}
<text x="72" y="118" font-size="20" font-weight="600" fill="${BRAND.mint}" letter-spacing="4">EXPLORE</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 62, "#F2F7F4")}
${textBlock(wrap(desc, 38, 4), 72, 410, 24, "#8FA79B", 400, 1.4)}
${footer("#F2F7F4", "#5E7468", "rout.be/explore")}`;
  },
  privacy: ({ title, desc }) => {
    const shield = (s: number, o: number) => {
      const cx = 940, cy = 300;
      return `<path d="M${cx} ${cy - 170 * s} L${cx + 140 * s} ${cy - 115 * s} V${cy + 10 * s} C${cx + 140 * s} ${cy + 110 * s} ${cx + 60 * s} ${cy + 170 * s} ${cx} ${cy + 200 * s} C${cx - 60 * s} ${cy + 170 * s} ${cx - 140 * s} ${cy + 110 * s} ${cx - 140 * s} ${cy + 10 * s} V${cy - 115 * s} Z" fill="none" stroke="#B48CFF" stroke-opacity="${o}" stroke-width="2"/>`;
    };
    return `<rect width="${W}" height="${H}" fill="#140A26"/>${[1.5, 1.3, 1.1, 0.9, 0.7].map((s, i) => shield(s, 0.15 + i * 0.17)).join("")}
<text x="940" y="335" font-size="120" font-weight="600" fill="#FFFFFF" text-anchor="middle" letter-spacing="-4">0</text><text x="940" y="378" font-size="20" font-weight="600" fill="#B48CFF" text-anchor="middle" letter-spacing="4">TRACKERS</text>
<text x="72" y="118" font-size="20" font-weight="600" fill="#B48CFF" letter-spacing="4">PRIVACY</text>
${textBlock(wrap(headline(title), 18, 3), 72, 210, 60, "#FFFFFF")}
${textBlock(wrap(desc, 38, 3), 72, 410, 24, "#A79BC2", 400, 1.4)}
${footer("#FFFFFF", "#7C6F99", "rout.be/privacy")}`;
  },
  press: ({ title, desc }) => {
    let grid = "";
    for (let x = 640; x <= W; x += 40) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#FFFFFF" stroke-opacity=".06"/>`;
    for (let y = 0; y <= H; y += 40) grid += `<line x1="640" y1="${y}" x2="${W}" y2="${y}" stroke="#FFFFFF" stroke-opacity=".06"/>`;
    return `<rect width="${W}" height="${H}" fill="${BRAND.ink}"/>${grid}
<rect x="780" y="120" width="280" height="343" fill="none" stroke="${BRAND.mint}" stroke-dasharray="6 6" stroke-opacity=".7"/>${bunny(820, 152, 200, "#FFFFFF")}
<text x="920" y="500" font-size="16" fill="#8A857C" text-anchor="middle" letter-spacing="3">CLEAR SPACE = 1 EAR</text>
<text x="72" y="118" font-size="20" font-weight="600" fill="${BRAND.mint}" letter-spacing="4">PRESS KIT</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 62, "#FFFFFF")}
${textBlock(wrap(desc, 34, 3), 72, 410, 24, "#9A948A", 400, 1.4)}
${[BRAND.ink, "#FFFFFF", BRAND.purple, BRAND.mint].map((c, i) => `<rect x="${72 + i * 52}" y="500" width="40" height="20" rx="4" fill="${c}" stroke="#3A3733"/>`).join("")}
${bunny(1110, 560, 20, "#FFFFFF")}`;
  },
  contact: ({ title, desc }) => `<rect width="${W}" height="${H}" fill="#F2725A"/>
<path d="M700 150 h360 a40 40 0 0 1 40 40 v200 a40 40 0 0 1 -40 40 h-250 l-70 60 v-60 h-40 a40 40 0 0 1 -40 -40 v-200 a40 40 0 0 1 40 -40z" fill="#FFF4EF"/>
${bunny(840, 205, 120, "#2A1410")}
<text x="72" y="118" font-size="20" font-weight="600" fill="#2A1410" letter-spacing="4">CONTACT</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 64, "#2A1410")}
${textBlock(wrap(desc, 38, 4), 72, 410, 24, "#5A2A20", 400, 1.4)}
${footer("#2A1410", "#6E3A2E", "rout.be/contact")}`,
  terms: ({ title, desc }) => {
    let lines = "";
    for (let i = 0; i < 9; i++) lines += `<rect x="740" y="${150 + i * 34}" width="${i % 3 === 2 ? 220 : 340}" height="10" rx="5" fill="#C9D4E3" fill-opacity="${i === 0 ? 1 : 0.45}"/>`;
    return `<rect width="${W}" height="${H}" fill="#1B2636"/><rect x="700" y="100" width="420" height="430" rx="20" fill="#24324A" stroke="#4A6382"/>${lines}
<text x="740" y="490" font-size="18" font-weight="600" fill="#9FB3CF" letter-spacing="3">§ 1 — § 24</text>
<text x="72" y="118" font-size="20" font-weight="600" fill="#9FB3CF" letter-spacing="4">TERMS</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 62, "#FFFFFF")}
${textBlock(wrap(desc, 38, 4), 72, 400, 24, "#9FB3CF", 400, 1.4)}
${footer("#FFFFFF", "#6F849F", "rout.be/terms")}`;
  },
  sovereignty: ({ title, desc }) => {
    // Twaalf sterren in een cirkel, zoals de Europese vlag.
    let stars = "";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      stars += `<circle cx="${920 + Math.cos(a) * 170}" cy="${310 + Math.sin(a) * 170}" r="9" fill="#F5C542"/>`;
    }
    return `<rect width="${W}" height="${H}" fill="#0E1A33"/>${stars}${bunny(870, 248, 100, "#FFFFFF")}
<text x="72" y="118" font-size="20" font-weight="600" fill="#F5C542" letter-spacing="4">SOVEREIGNTY</text>
${textBlock(wrap(headline(title), 16, 3), 72, 210, 62, "#FFFFFF")}
${textBlock(wrap(desc, 38, 4), 72, 400, 24, "#9AA8C7", 400, 1.4)}
${footer("#FFFFFF", "#6A7899", "rout.be/sovereignty")}`;
  },
};

export function isPageKey(v: string): v is PageKey {
  return v in PAGE_CARDS;
}

export function renderPageCardSvg(key: PageKey, locale: Locale) {
  const card = PAGE_CARDS[key];
  const t = card.text[locale] ?? card.text.en;
  const body = TEMPLATES[key]({ title: t.title, desc: t.description, path: card.path });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">${body}</svg>`;
}

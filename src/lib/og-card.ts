/**
 * Vector-opbouw van de dynamische OpenGraph-kaart (1200×630).
 *
 * De kaart volgt het Studio-ontwerp van het profiel: dezelfde canvas- en
 * tekstkleuren, hetzelfde koplettertype, dezelfde avatarvorm en exact
 * dezelfde badge (blauw vinkje, schild, zwarte domeinbadge, creatorbadge)
 * naast de naam. Het ROUT-konijn komt uitsluitend uit `brand/logo`.
 */
import { bunny } from "@/lib/brand/logo";
import { VERIFIED_MARK } from "./verified-mark";

export type OgBadge = "verified" | "human" | "domain" | "influencer" | null;
export type OgAvatarShape = "circle" | "rounded" | "squircle" | "hexagon";

export interface OgCardInput {
  handle: string;
  name: string;
  tagline: string;
  /** Canvas-, kaart-, tekst-, gedempte en accentkleur van het Studio-thema. */
  bg: string;
  card?: string;
  text?: string;
  muted?: string;
  accent: string;
  /** Optioneel kleurverloop (banner) over het canvas. */
  gradientFrom?: string | null;
  gradientTo?: string | null;
  /** Patroon: "dots" | "grid" | iets anders = effen. */
  pattern?: string;
  /** Font-family van de kop (moet als font in og-render geladen zijn). */
  headingFont?: string;
  titleColor?: string | null;
  avatarUrl: string | null;
  avatarShape?: OgAvatarShape;
  badge?: OgBadge;
  /** Optioneel: "rout.be/u/alias" i.p.v. "rout.be/handle". */
  urlLabel?: string;
  /** @deprecated gebruik `badge`. */
  verified?: boolean;
  /** @deprecated gebruik `badge`. */
  alias?: boolean;
}

export function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
}

/** Breekt tekst af op woordgrenzen zodat de kaart nooit overloopt. */
export function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > perLine) {
      lines.push(current.trim());
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

export function initials(name: string) {
  return name
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Relatieve luminantie van een #hex-kleur (0 = zwart, 1 = wit). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function avatarClip(shape: OgAvatarShape, cx: number, cy: number, r: number) {
  if (shape === "rounded") return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.28}"/>`;
  if (shape === "squircle") return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.76}"/>`;
  if (shape === "hexagon") {
    const pts = [
      [0.5, 0], [0.93, 0.25], [0.93, 0.75], [0.5, 1], [0.07, 0.75], [0.07, 0.25],
    ].map(([x, y]) => `${cx - r + x! * 2 * r},${cy - r + y! * 2 * r}`);
    return `<polygon points="${pts.join(" ")}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
}

/** Badge-iconen: zelfde vormen en kleuren als op het publieke profiel. */
export function badgeSvg(type: OgBadge, x: number, y: number, size: number, ink: string) {
  if (!type) return "";
  const s = size / 24;
  const open = `<g transform="translate(${x} ${y}) scale(${s})">`;
  if (type === "verified") {
    return `${open}<path d="${VERIFIED_MARK.outline}" fill="none" stroke="${VERIFIED_MARK.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="${VERIFIED_MARK.check}" fill="none" stroke="${VERIFIED_MARK.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  if (type === "human") {
    return `${open}<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  if (type === "domain") {
    return `${open}<defs><linearGradient id="ogbiz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2e"/><stop offset="1" stop-color="#050505"/></linearGradient><linearGradient id="oggold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5d98a"/><stop offset="1" stop-color="#b8892c"/></linearGradient></defs><path d="M12 1.6l8.4 3.1v6.4c0 5.2-3.6 9.4-8.4 11.3C7.2 20.5 3.6 16.3 3.6 11.1V4.7z" fill="url(#ogbiz)" stroke="#ffffff" stroke-opacity="0.55" stroke-width="0.8" stroke-linejoin="round"/><path d="M12 3.4l6.7 2.5v5.2c0 4.2-2.8 7.6-6.7 9.2-3.9-1.6-6.7-5-6.7-9.2V5.9z" fill="none" stroke="url(#oggold)" stroke-width="1.1" stroke-linejoin="round"/><path d="M8.3 11.8l2.6 2.6 4.9-5.2" fill="none" stroke="url(#oggold)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  // Creator (roze ster-badge).
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16 - Math.PI / 2;
    const r = i % 2 === 0 ? 11 : 9.2;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `${open}<defs><linearGradient id="ogcr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fa2"/><stop offset="1" stop-color="#c2185b"/></linearGradient></defs><polygon points="${pts.join(" ")}" fill="url(#ogcr)" stroke="#ffffff" stroke-opacity="0.6" stroke-width="0.8" stroke-linejoin="round"/><path d="M7.6 12.3l3 3 5.8-6.2" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

/** Ruwe breedte-schatting per teken voor de badge-positie naast de naam. */
function textWidth(text: string, size: number, font: string) {
  const factor = /Bebas|Archivo|Orbitron|Mono/i.test(font)
    ? /Bebas/.test(font) ? 0.42 : 0.66
    : /Caveat|Instrument|Cormorant/i.test(font) ? 0.42 : /Playfair|Baskerville/i.test(font) ? 0.5 : 0.53;
  return text.length * size * factor;
}

export function ogSvg(input: OgCardInput) {
  const bg = input.bg;
  const dark = luminance(bg) < 0.4;
  const text = input.text ?? (dark ? "#F5F5F5" : "#1C1917");
  const muted = input.muted ?? (dark ? "#A3A3A3" : "#78716C");
  const accent = input.accent;
  const font = input.headingFont ?? "Inter";
  const shape = input.avatarShape ?? "circle";
  const badge: OgBadge =
    input.badge !== undefined ? input.badge : input.verified ? "verified" : input.alias ? "human" : null;

  const name = input.name.slice(0, 26);
  const nameSize = name.length > 18 ? 54 : 64;
  const lines = wrap(input.tagline, 46, 2);
  const cx = 230;
  const cy = 300;
  const r = 130;

  const ringClip = avatarClip(shape, cx, cy, r + 8);
  const clip = avatarClip(shape, cx, cy, r);
  const avatar = input.avatarUrl
    ? `<clipPath id="a">${clip}</clipPath>
       <g fill="${escapeXml(accent)}" fill-opacity="0.9">${ringClip}</g>
       <g fill="${escapeXml(bg)}">${avatarClip(shape, cx, cy, r + 3)}</g>
       <image href="${escapeXml(input.avatarUrl)}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#a)"/>`
    : `<g fill="${escapeXml(input.card ?? accent)}" stroke="${escapeXml(accent)}" stroke-width="5">${clip}</g>
       <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-family="${escapeXml(font)}" font-size="88" font-weight="600" fill="${escapeXml(text)}">${escapeXml(initials(input.name))}</text>`;

  const nameX = 420;
  const nameY = 290;
  const badgeX = nameX + textWidth(name, nameSize, font) + 14;
  const badgeSize = Math.round(nameSize * 0.72);
  const urlLabel = input.urlLabel ?? `rout.be/${input.handle}`;

  const gradient =
    input.gradientFrom && input.gradientTo
      ? `<linearGradient id="bn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${escapeXml(input.gradientFrom)}"/><stop offset="1" stop-color="${escapeXml(input.gradientTo)}"/></linearGradient>`
      : "";
  const patternDef =
    input.pattern === "dots"
      ? `<pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="1.6" fill="${escapeXml(muted)}" fill-opacity="0.35"/></pattern>`
      : input.pattern === "grid" || input.pattern === "blueprint"
        ? `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${escapeXml(muted)}" stroke-opacity="0.18" stroke-width="1"/></pattern>`
        : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(input.name)} op ROUT">
  <defs>${gradient}${patternDef}</defs>
  <rect width="1200" height="630" fill="${escapeXml(bg)}"/>
  ${gradient ? `<rect width="1200" height="630" fill="url(#bn)" opacity="0.55"/>` : ""}
  ${patternDef ? `<rect width="1200" height="630" fill="url(#p)"/>` : ""}
  ${avatar}
  <text x="${nameX}" y="${nameY}" font-family="${escapeXml(font)}" font-size="${nameSize}" font-weight="600" fill="${escapeXml(input.titleColor ?? text)}">${escapeXml(name)}</text>
  ${badgeSvg(badge, badgeX, nameY - badgeSize + 4, badgeSize, text)}
  <text x="${nameX + 2}" y="${nameY + 52}" font-family="Inter" font-size="30" font-weight="600" fill="${escapeXml(accent)}">${escapeXml(urlLabel)}</text>
  ${lines
    .map(
      (line, i) =>
        `<text x="${nameX + 2}" y="${nameY + 108 + i * 40}" font-family="Inter" font-size="28" fill="${escapeXml(muted)}">${escapeXml(line)}</text>`,
    )
    .join("")}
  ${bunny(1092, 548, 30, text)}
  <text x="1080" y="574" text-anchor="end" font-family="Inter" font-size="24" font-weight="600" fill="${escapeXml(text)}" letter-spacing="-0.5">ROUT</text>
</svg>`;
}

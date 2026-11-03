/**
 * Draws both faces of the ROUT Card on 2D canvases (browser only). The same
 * images feed the WebGL card and the CSS fallback, so both look identical.
 * Portrait ID-1 ratio 1 : 1.588.
 */
import qrcode from "qrcode-generator";
import type { WalletCardPayload } from "@/lib/wallet/wallet-pass";
import { cardMrz } from "@/lib/wallet/card-mrz";

export const CARD_RATIO = 1.588;
export const FACE_W = 640;
export const FACE_H = Math.round(FACE_W * CARD_RATIO);

/**
 * front/back: printed artwork. mask (WebGL only): R = holographic foil
 * (emblem, ring, frame), G = latent kinegram watermark, B = emboss height.
 */
export type CardFaces = { front: HTMLCanvasElement; back: HTMLCanvasElement; mask: HTMLCanvasElement };

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v + amount * 255))));
  return `rgb(${c.join(",")})`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // A slow photo must never block the card: draw the initial instead.
    const timer = setTimeout(() => resolve(null), 4000);
    img.decoding = "async";
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, weight: number) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    s -= 2;
  } while (ctx.measureText(text).width > max && s > 14);
}

/** Crisp QR modules with a 4-module quiet zone; error correction M. */
export function drawQr(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.floor(size / (n + 8));
  const total = cell * (n + 8);
  const ox = x + Math.floor((size - total) / 2);
  const oy = y + Math.floor((size - total) / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(ox, oy, total, total);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(ox + (c + 4) * cell, oy + (r + 4) * cell, cell, cell);
}

/** The six-point ROUT seal used as the holographic emblem. */
function drawEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.62;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export async function drawCardFaces(card: Omit<WalletCardPayload, "heroImageUrl"> & { avatarPath?: string | null }, opts: { sdfText?: boolean } = {}): Promise<CardFaces> {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = FACE_W;
    c.height = FACE_H;
    return c;
  };
  const front = make();
  const back = make();
  const mask = make();
  const bg = card.hexBackgroundColor;
  const fg = card.hexForegroundColor;
  const avatar = card.avatarPath ? await loadImage(card.avatarPath) : null;

  // Front: brand gradient, pulse ring, portrait, name, handle, emblem.
  const f = front.getContext("2d")!;
  const g = f.createLinearGradient(0, 0, FACE_W, FACE_H);
  g.addColorStop(0, shade(bg, 0.08));
  g.addColorStop(1, shade(bg, -0.08));
  f.fillStyle = g;
  f.fillRect(0, 0, FACE_W, FACE_H);
  f.fillStyle = fg;
  f.globalAlpha = 0.9;
  f.font = `700 34px ui-sans-serif, system-ui, sans-serif`;
  f.fillText("ROUT", 48, 78);
  f.globalAlpha = 0.55;
  f.font = `500 18px ui-monospace, SFMono-Regular, monospace`;
  f.textAlign = "right";
  f.fillText(card.sovereignId, FACE_W - 48, 76);
  f.textAlign = "left";
  f.globalAlpha = 1;
  const cx = FACE_W / 2;
  const cy = FACE_H * 0.42;
  const r = 150;
  const ring = f.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, "#f59e0b");
  ring.addColorStop(0.5, "#ec4899");
  ring.addColorStop(1, "#8b5cf6");
  f.strokeStyle = ring;
  f.lineWidth = 12;
  f.beginPath();
  f.arc(cx, cy, r + 14, 0, Math.PI * 2);
  f.stroke();
  f.save();
  f.beginPath();
  f.arc(cx, cy, r, 0, Math.PI * 2);
  f.clip();
  if (avatar) {
    const s = Math.max((2 * r) / avatar.width, (2 * r) / avatar.height);
    f.drawImage(avatar, cx - (avatar.width * s) / 2, cy - (avatar.height * s) / 2, avatar.width * s, avatar.height * s);
  } else {
    f.fillStyle = shade(bg, 0.18);
    f.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    f.fillStyle = fg;
    f.font = `600 110px ui-sans-serif, system-ui, sans-serif`;
    f.textAlign = "center";
    f.textBaseline = "middle";
    f.fillText((card.displayName.replace(/^@/, "")[0] ?? "R").toUpperCase(), cx, cy + 6);
    f.textBaseline = "alphabetic";
  }
  f.restore();
  if (!opts.sdfText) {
    f.textAlign = "center";
    f.fillStyle = fg;
    fitText(f, card.displayName, FACE_W - 96, 52, 700);
    f.fillText(card.displayName, cx, FACE_H * 0.7);
    f.globalAlpha = 0.75;
    fitText(f, `@${card.handle}`, FACE_W - 96, 30, 500);
    f.fillText(`@${card.handle}`, cx, FACE_H * 0.7 + 48);
    f.globalAlpha = 0.6;
    fitText(f, card.subheader, FACE_W - 96, 22, 400);
    f.fillText(card.subheader, cx, FACE_H * 0.7 + 92);
  }
  f.textAlign = "center";
  f.globalAlpha = 0.45;
  f.font = `500 18px ui-sans-serif, system-ui, sans-serif`;
  f.fillText(card.url.replace(/^https?:\/\//, ""), cx, FACE_H - 56);
  f.globalAlpha = 1;

  // Emblem bottom-right of the portrait, printed faintly; the foil does the rest.
  const ex = FACE_W - 92;
  const ey = FACE_H * 0.58;
  f.globalAlpha = 0.35;
  f.fillStyle = fg;
  drawEmblem(f, ex, ey, 34);
  f.globalAlpha = 1;

  // Mask: R foil, G latent watermark, B emboss.
  const m = mask.getContext("2d")!;
  m.fillStyle = "#000";
  m.fillRect(0, 0, FACE_W, FACE_H);
  m.globalCompositeOperation = "lighter";
  m.fillStyle = "#ff0000";
  m.strokeStyle = "#ff0000";
  drawEmblem(m, ex, ey, 34);
  m.lineWidth = 16;
  m.beginPath();
  m.arc(cx, cy, r + 14, 0, Math.PI * 2);
  m.stroke();
  m.lineWidth = 10;
  m.strokeRect(14, 14, FACE_W - 28, FACE_H - 28);
  m.font = `700 34px ui-sans-serif, system-ui, sans-serif`;
  m.textAlign = "left";
  m.fillText("ROUT", 48, 78);
  m.save();
  m.translate(FACE_W / 2, FACE_H * 0.55);
  m.rotate(-Math.PI / 5);
  m.fillStyle = "#00ff00";
  m.textAlign = "center";
  m.font = `800 92px ui-sans-serif, system-ui, sans-serif`;
  m.fillText("SECURE", 0, -30);
  m.font = `700 46px ui-monospace, SFMono-Regular, monospace`;
  m.fillText(card.sovereignId, 0, 40);
  m.restore();
  m.fillStyle = "#0000ff";
  m.font = `700 34px ui-sans-serif, system-ui, sans-serif`;
  m.fillText("ROUT", 48, 78);
  drawEmblem(m, ex, ey, 34);
  m.globalCompositeOperation = "source-over";

  // Back: deep graphite with a white QR panel (scans like paper), NFC mark,
  // live-code slot (drawn in 3D) and an ICAO-style machine-readable zone.
  const b = back.getContext("2d")!;
  const bgB = b.createLinearGradient(0, 0, 0, FACE_H);
  bgB.addColorStop(0, "#17171b");
  bgB.addColorStop(1, "#0b0b0d");
  b.fillStyle = bgB;
  b.fillRect(0, 0, FACE_W, FACE_H);
  b.fillStyle = "#f4f4f5";
  b.font = `700 30px ui-sans-serif, system-ui, sans-serif`;
  b.fillText("ROUT", 48, 76);
  b.strokeStyle = "#f4f4f5";
  b.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    b.beginPath();
    b.arc(FACE_W - 76, 66, 10 + i * 10, -Math.PI / 4, Math.PI / 4);
    b.stroke();
  }
  const qrSize = FACE_W - 176;
  const qy = Math.round(FACE_H * 0.13);
  b.fillStyle = "#ffffff";
  b.beginPath();
  b.roundRect(88 - 12, qy - 12, qrSize + 24, qrSize + 24, 24);
  b.fill();
  drawQr(b, card.qrValue, 88, qy, qrSize);
  b.textAlign = "center";
  b.fillStyle = "#e4e4e7";
  fitText(b, card.url.replace(/^https?:\/\//, ""), FACE_W - 96, 26, 600);
  b.fillText(card.url.replace(/^https?:\/\//, ""), FACE_W / 2, qy + qrSize + 56);
  // Live-code slot frame; the code itself is SDF text in the 3D card.
  b.strokeStyle = "rgba(255,255,255,0.18)";
  b.lineWidth = 2;
  b.beginPath();
  b.roundRect(48, qy + qrSize + 80, FACE_W - 96, 64, 14);
  b.stroke();
  b.fillStyle = "rgba(255,255,255,0.45)";
  b.font = `600 15px ui-monospace, SFMono-Regular, monospace`;
  b.fillText("LIVE · PROOF OF NOW", FACE_W / 2, qy + qrSize + 100);
  // MRZ strip
  const mrzTop = FACE_H - 150;
  b.fillStyle = "#e9e7e1";
  b.fillRect(0, mrzTop, FACE_W, 150);
  b.fillStyle = "#18181b";
  b.font = `600 26px ui-monospace, SFMono-Regular, Menlo, monospace`;
  b.textAlign = "left";
  const lines = cardMrz({ sovereignId: card.sovereignId, handle: card.handle, space: card.space });
  const cw = (FACE_W - 64) / 30;
  lines.forEach((line, row) => {
    for (let c = 0; c < line.length; c++) b.fillText(line[c]!, 32 + c * cw, mrzTop + 42 + row * 38);
  });
  return { front, back, mask };
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

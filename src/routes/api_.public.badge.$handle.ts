import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { createFileRoute } from "@tanstack/react-router";

/**
 * "Verified on ROUT" badge — publieke SVG die makers op hun eigen site kunnen
 * embedden. Geen PII: alleen handle en verificatiestatus.
 */
function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
}

type Theme = "dark" | "light";
type Size = "sm" | "md";

const PALETTE: Record<Theme, { bg: string; border: string; muted: string; text: string }> = {
  dark: { bg: "#0f0f11", border: "#2a2a30", muted: "#8a8a94", text: "#f4efe3" },
  light: { bg: "#ffffff", border: "#e4e2dc", muted: "#6b6b74", text: "#141416" },
};

function badgeSvg(handle: string, verified: boolean, theme: Theme, size: Size) {
  const c = PALETTE[theme];
  const label = `@${handle}`;
  const h = size === "sm" ? 28 : 40;
  const scale = h / 40;
  const baseW = Math.max(190, 118 + label.length * 8);
  const width = Math.round(baseW * scale);
  const accent = verified ? (theme === "dark" ? "#3ea6ff" : "#1d7fe0") : theme === "dark" ? "#c9b273" : "#8f7833";
  const mark = verified
    ? `<path d="M-3.2 0.2 -1 2.4 3.4 -2.2" fill="none" stroke="${accent}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle r="7.4" fill="none" stroke="${accent}" stroke-width="1.6"/>`
    : `<path d="M0 -7.6 6.6 -4.8V0.6C6.6 4.2 3.8 6.6 0 7.8 -3.8 6.6 -6.6 4.2 -6.6 0.6V-4.8Z" fill="none" stroke="${accent}" stroke-width="1.6"/><path d="M-2.9 0.2 -0.8 2.2 3 -1.9" fill="none" stroke="${accent}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`;
  const font = "ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${baseW} 40" role="img" aria-label="${escapeXml(label)} — ${verified ? "verified" : "privacy shield"} on ROUT"><rect x="0.5" y="0.5" width="${baseW - 1}" height="39" rx="10" fill="${c.bg}" stroke="${c.border}"/><g transform="translate(24 20)">${mark}</g><text x="42" y="16.5" font-family="${font}" font-size="9" letter-spacing="1.4" fill="${c.muted}">${verified ? "VERIFIED ON ROUT" : "PRIVACY SHIELD"}</text><text x="42" y="29.5" font-family="${font}" font-size="12.5" font-weight="600" fill="${c.text}">${escapeXml(label)}</text></svg>`;
}

export const Route = createFileRoute("/api_/public/badge/$handle")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const q = new URL(request.url).searchParams;
        const theme: Theme = q.get("theme") === "light" ? "light" : "dark";
        const size: Size = q.get("size") === "sm" ? "sm" : "md";
        const handle = sanitizeHandleInput(String(params.handle ?? "").replace(/\.svg$/i, ""));

        if (!/^[a-z0-9._-]{2,40}$/.test(handle)) {
          return new Response("Invalid handle", { status: 400 });
        }

        let verified = false;
        try {
          const { sql } = await import("@/lib/neon");
          const rows = (await sql`
            select verified from public.profiles where username = ${handle} limit 1
          `) as { verified?: boolean }[];
          if (rows.length === 0) return new Response("Not found", { status: 404 });
          verified = Boolean(rows[0]?.verified);
        } catch {
          // Database niet bereikbaar: toon de neutrale schild-variant.
        }

        return new Response(badgeSvg(handle, verified, theme, size), {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
            "access-control-allow-origin": "*",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});

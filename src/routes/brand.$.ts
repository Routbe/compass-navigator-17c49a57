import { createFileRoute } from "@tanstack/react-router";

/**
 * Vaste ROUT-URL voor merkbestanden.
 * - `/brand/og/<pagina>-<taal>.png`: in code getekende deel-kaart. Eén keer
 *   gerenderd, daarna bewaard in de interne Scaleway-bucket en van daar geleverd.
 * - `/brand/press/<bestand>`: perskit, via Scaleway met lokale terugval.
 */
const OG_RE = /^og\/([a-z]+)-(nl|en|fr|de)\.png$/;
const PRESS_RE = /^press\/[a-z0-9-]+\.(png|svg|zip)$/;
/** Versie in de opslagsleutel: verhogen wanneer het ontwerp verandert. */
const OG_VERSION = "v1";

const LONG_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

export const Route = createFileRoute("/brand/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = String(params._splat ?? "");
        const og = OG_RE.exec(path);
        if (og) return serveOg(og[1], og[2] as "nl" | "en" | "fr" | "de", new URL(request.url).origin);
        if (!PRESS_RE.test(path)) return new Response("Not found", { status: 404 });
        try {
          const { storageConfigured, presignedGetUrl } = await import("@/lib/storage/s3.server");
          if (storageConfigured("internal")) {
            const url = await presignedGetUrl("internal", `brand/${path}`, 60 * 60 * 24);
            return new Response(null, { status: 302, headers: { location: url, "cache-control": "public, max-age=3600" } });
          }
        } catch (error) {
          console.error("[brand] presign failed", error);
        }
        return new Response(null, { status: 302, headers: { location: `/${path}`, "cache-control": "public, max-age=300" } });
      },
    },
  },
});

async function serveOg(page: string, locale: "nl" | "en" | "fr" | "de", origin: string) {
  const { isPageKey, renderPageCardSvg } = await import("@/lib/page-og.server");
  if (!isPageKey(page)) return new Response("Not found", { status: 404 });
  const key = `brand/og/${OG_VERSION}/${page}-${locale}.png`;
  const s3 = await import("@/lib/storage/s3.server");
  const stored = s3.storageConfigured("internal");

  if (stored) {
    try {
      const url = await s3.presignedGetUrl("internal", key, 60 * 60 * 24 * 7);
      const head = await fetch(url, { method: "HEAD" });
      if (head.ok) return new Response(null, { status: 302, headers: { location: url, "cache-control": "public, max-age=86400" } });
    } catch (error) {
      console.error("[brand/og] lookup failed", error);
    }
  }

  const svg = renderPageCardSvg(page, locale);
  try {
    const { svgToPng } = await import("@/lib/og-render.server");
    const png = await svgToPng(svg, origin);
    if (stored) {
      s3.putObject("internal", key, png, { contentType: "image/png" }).catch((e) => console.error("[brand/og] upload failed", e));
    }
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": LONG_CACHE } });
  } catch (error) {
    console.error("[brand/og] render failed", error);
    return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=300" } });
  }
}

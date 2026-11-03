import { createFileRoute } from "@tanstack/react-router";
import { parseDisplayPrefs } from "@/lib/profile-display";
import { ogSvg, type OgBadge, type OgAvatarShape } from "@/lib/og-card";
import { themeOf } from "@/lib/profile";
import { profileSurface } from "@/lib/profile-surface";
import { fontPairingOf } from "@/lib/profile-design";
import { ogHeadingFont } from "@/lib/og-fonts";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";

/**
 * Dynamische OpenGraph-kaart (1200×630) voor profielen zonder eigen
 * uploadafbeelding. De vector wordt op de rand gerenderd — geen headless
 * browser, geen externe render-service, geen tracking.
 *
 * `/api/public/og/<handle>.png` levert een PNG (Discord, WhatsApp, Slack,
 * iMessage en LinkedIn tonen geen SVG-kaarten). `<handle>.svg` blijft
 * beschikbaar voor debug en voor crawlers die vector wél aankunnen.
 */
export const Route = createFileRoute("/api_/public/og/$handle")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw = String(params.handle ?? "");
        const wantsSvg = /\.svg$/i.test(raw);
        const handle = sanitizeHandleInput(raw.replace(/\.(svg|png)$/i, ""));
        const spaceParam = new URL(request.url).searchParams.get("space");
        const space = spaceParam === "alias" ? "alias" : spaceParam === "workspace" ? "workspace" : "root";
        if (!/^[a-z0-9._-]{2,40}$/.test(handle)) {
          return new Response("Invalid handle", { status: 400 });
        }

        let name = `@${handle}`;
        let tagline = "Eén soevereine link voor alles wat je maakt.";
        let verified = false;
        let accent = "#C9A84C";
        let design: Record<string, unknown> = { bg: "#131211" };
        let avatarUrl: string | null = null;
        let urlLabel: string | undefined;

        try {
          const { readOgProfile } = await import("@/lib/og-profile.server");
          const row = await readOgProfile(handle, space);
          if (!row) return new Response("Not found", { status: 404 });
          const prefs = parseDisplayPrefs(row["display_prefs"]);
          // Profielen die het lid op privé heeft gezet leveren nooit een
          // gepersonaliseerde kaart: bio, tagline en avatar blijven verborgen.
          if (!prefs.publicProfile) return new Response("Not found", { status: 404 });
          name = ((row["display_name"] as string | null) || `@${handle}`).trim();
          tagline =
            prefs.metaDescription ||
            ((row["tagline"] as string | null) ?? "").trim() ||
            ((row["bio"] as string | null) ?? "").trim().slice(0, 160) ||
            tagline;
          verified = Boolean(row["verified"]);
          // Studio-ontwerp: thema + eigen canvas/patroon, kopfont, avatarvorm, badge.
          const t = profileSurface(themeOf(String(row["theme"] ?? "")), prefs.canvasColor);
          const p = prefs as typeof prefs & Record<string, unknown>;
          const custom = Boolean(p["typographyCustom"] || p["customDesign"]);
          accent = prefs.accentColor ?? (p["patternColor"] as string | null) ?? t.accent ?? accent;
          const badge: OgBadge =
            !verified || !prefs.badgeVisible || prefs.badgeType === "none"
              ? null
              : row["is_business"]
                ? "domain"
                : row["is_influencer"]
                  ? "influencer"
                  : prefs.badgeType === "human"
                    ? "human"
                    : "verified";
          design = {
            bg: (p["canvasColor"] as string | null) ?? t.bg,
            card: t.card,
            text: t.text,
            muted: t.muted,
            pattern: prefs.backgroundStyle,
            gradientFrom: prefs.bannerStyle === "gradient" ? prefs.bannerFrom : null,
            gradientTo: prefs.bannerStyle === "gradient" ? prefs.bannerTo : null,
            headingFont: ogHeadingFont(
              custom ? fontPairingOf(p["fontPairing"] as never).heading : prefs.typography === "serif" ? "'Playfair Display'" : prefs.typography === "mono" ? "'JetBrains Mono'" : "'Inter'",
            ),
            titleColor: custom ? ((p["titleColor"] as string | null) ?? null) : null,
            avatarShape: (prefs.avatarShape ?? "circle") as OgAvatarShape,
            badge,
          };
          urlLabel = space === "alias" ? `rout.be/u/${handle}` : space === "workspace" ? `rout.be/w/${handle}` : `rout.be/${handle}`;
          const avatar = row["avatar_url"] as string | null;
          avatarUrl = avatar || null;
        } catch {
          // Database onbereikbaar: toon de generieke ROUT-kaart.
        }

        const cache = "public, max-age=300, s-maxage=1800";
        const origin = new URL(request.url).origin;
        const { fetchImageAsDataUri } = await import("@/lib/og-render.server");
        // SVG loaded as an <img> cannot fetch nested remote images either.
        // Both formats therefore use the same first-party/proxied inline photo.
        const inlineAvatar = avatarUrl ? await fetchImageAsDataUri(avatarUrl, origin) : null;

        if (!wantsSvg) {
          try {
            const { svgToPng } = await import("@/lib/og-render.server");
            // resvg haalt zelf geen externe afbeeldingen op: de avatar moet
            // als data-URI in de vector zitten voor we rasteriseren.
            const png = await svgToPng(
              ogSvg({
                handle,
                name,
                tagline,
                accent,
                ...design,
                bg: String(design.bg),
                avatarUrl: inlineAvatar,
                ...(urlLabel ? { urlLabel } : {}),
              }),
              new URL(request.url).origin,
              String(design.bg),
            );
            return new Response(png as unknown as BodyInit, {
              headers: { "content-type": "image/png", "cache-control": cache },
            });
          } catch (error) {
            console.error("og png render failed", error);
            // Val terug op de vector zodat de kaart nooit helemaal wegvalt.
          }
        }

        const svg = ogSvg({
          handle,
          name,
          tagline,
          accent,
          ...design,
          bg: String(design.bg),
          avatarUrl: inlineAvatar,
          ...(urlLabel ? { urlLabel } : {}),
        });

        return new Response(svg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": cache,
          },
        });
      },
    },
  },
});

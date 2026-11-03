import { createFileRoute } from "@tanstack/react-router";
import { linkIntentCookie } from "@/lib/link-intent";

/**
 * Stap 1 van de Mastodon/Fediverse-login: ROUT registreert zich (indien nodig)
 * op de server die het lid opgeeft en stuurt daarna door naar de inlogpagina
 * van die server. De clientsecret van die instance blijft server-side.
 */
export const Route = createFileRoute("/api_/public/mastodon/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Strikte IP-rate limit: registratie doet een uitgaand netwerkverzoek.
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const limited = await guardShared(request, "mastodon-start", { limit: 10, windowSec: 60 });
        if (limited) return limited;

        const url = new URL(request.url);
        const instance = url.searchParams.get("instance") ?? "";
        const next = url.searchParams.get("next") ?? "/dashboard";

        const { canonicalAppUrl, isApprovedHost } = await import("@/lib/app-url");
        const host = request.headers.get("host") ?? "";
        const origin =
          process.env["NEXT_PUBLIC_APP_URL"]?.replace(/\/$/, "") ||
          (isApprovedHost(host) && !host.startsWith("localhost")
            ? `https://${host}`
            : canonicalAppUrl());

        try {
          const { buildMastodonAuthorizeUrl } = await import("@/lib/mastodon-auth.server");
          const { url: authorizeUrl } = await buildMastodonAuthorizeUrl({
            instance,
            origin,
            next,
          });
          const headers = new Headers({ location: authorizeUrl });
          headers.append("set-cookie", linkIntentCookie(url.searchParams.get("link") === "1"));
          return new Response(null, { status: 302, headers });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Aanmelden via Mastodon mislukte.";
          return new Response(null, {
            status: 302,
            headers: { location: `/auth/sign-in?mastodon_error=${encodeURIComponent(message)}` },
          });
        }
      },
    },
  },
});

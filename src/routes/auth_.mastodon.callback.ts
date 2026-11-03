import { createFileRoute } from "@tanstack/react-router";
import { clearLinkIntent, maybeLinkToCurrentUser } from "@/lib/link-intent";

/**
 * Stap 2 van de Mastodon-login. De instance stuurt het lid hier terug met een
 * code; die wisselen we in, we controleren het account en zetten daarna de
 * eigen ROUT-sessiecookie.
 */
export const Route = createFileRoute("/auth_/mastodon/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const failure = url.searchParams.get("error_description") ?? url.searchParams.get("error");

        const fail = (message: string) => {
          console.warn("[auth] mastodon callback failed", { message });
          const code = /denied/i.test(message) ? "access_denied" : "provider_rejected";
          return new Response(null, { status: 303, headers: { location: `/auth/sign-in?error=${code}` } });
        };

        if (failure || !code || !state) {
          return fail(failure ?? "De aanmelding bij je Fediverse-server is afgebroken.");
        }

        try {
          const { completeMastodonCallback } = await import("@/lib/mastodon-auth.server");
          const { createAppSessionValue } = await import("@/lib/app-session.server");
          const result = await completeMastodonCallback({ code, state });
          const linked = await maybeLinkToCurrentUser(request, "mastodon", result.subject, result.handle);
          if (linked) {
            const h = new Headers({ location: linked, "cache-control": "no-store" });
            h.append("set-cookie", clearLinkIntent());
            return new Response(null, { status: 303, headers: h });
          }
          if (!result.userId) {
            const { signValue } = await import("@/lib/app-session.server");
            const { encodePending, FEDI_PENDING_COOKIE } = await import("@/lib/fediverse-otp.server");
            const pending = await signValue(
              encodePending({ provider: "mastodon", accountId: result.subject, handle: result.handle, next: result.next }),
            );
            return new Response(null, {
              status: 302,
              headers: {
                location: "/auth/bluesky",
                "set-cookie": `${FEDI_PENDING_COOKIE}=${encodeURIComponent(pending)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=900`,
              },
            });
          }
          const session = await createAppSessionValue(result.userId);
          const headers = new Headers({ location: "/auth/continue", "cache-control": "no-store" });
          headers.append("set-cookie", `rout_session=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${60 * 60 * 24 * 30}`);
          headers.append("set-cookie", `rout_next=${encodeURIComponent(result.next)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`);
          return new Response(null, { status: 303, headers });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Aanmelden via Mastodon mislukte.";
          return fail(message);
        }
      },
    },
  },
});

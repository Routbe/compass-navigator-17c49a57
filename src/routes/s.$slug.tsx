import { createFileRoute } from "@tanstack/react-router";
import Page from "@/components/imported-pages/ShortLink";

/**
 * `/s/<code>` resolves at the edge: the GET handler answers with a `302` before
 * any HTML is produced. Only when the code is missing, paused or expired do we
 * defer to the app router, which renders the human-readable message page.
 */
export const Route = createFileRoute("/s/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params, next }) => {
        const { resolveShortLink, redirectResponse, rateLimitedResponse, pausedResponse } =
          await import("@/lib/short-link-redirect.server");
        const { RateLimitError } = await import("@/lib/rate-limit.server");
        const { guardShared } = await import("@/lib/rate-limit-db.server");
        const { RATE_RULES } = await import("@/lib/rate-limit-rules");
        const shared = await guardShared(request, "short-link", RATE_RULES.shortLink);
        if (shared) return shared;
        try {
          const result = await resolveShortLink(params.slug, request);
          if (result?.status === "ok") return redirectResponse(result.targetUrl);
          if (result?.status === "paused") return pausedResponse(request);
        } catch (error) {
          if (error instanceof RateLimitError) {
            return rateLimitedResponse(error.retryAfterSeconds);
          }
        }
        return next();
      },
    },
  },
  head: () => ({
    meta: [
      { title: "ROUT" },
      { name: "description", content: "ROUT — QR-codes en korte links met karakter." },
      { property: "og:title", content: "ROUT" },
      { property: "og:description", content: "ROUT — QR-codes en korte links met karakter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

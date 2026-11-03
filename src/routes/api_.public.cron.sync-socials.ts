import { createFileRoute } from "@tanstack/react-router";

/**
 * Dagelijkse sync van geverifieerde sociale accounts: vernieuwt gecachte
 * volgeraantallen en trekt de verificatie in wanneer de ROUT-link uit de bio is
 * verdwenen. Beveiligd met LOVABLE_CRON_SECRET.
 */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { syncVerifiedSocialLinks } = await import("@/lib/social-verify.server");
  const result = await syncVerifiedSocialLinks();
  return Response.json(result);
}

export const Route = createFileRoute("/api_/public/cron/sync-socials")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

/**
 * Achtergrond-sync van volgeraantallen (0-kost: open API's + OpenGraph).
 * Beveiligd met LOVABLE_CRON_SECRET.
 */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { syncFollowersBatch } = await import("@/lib/total-reach.server");
  const result = await syncFollowersBatch();
  return Response.json(result);
}

export const Route = createFileRoute("/api_/public/cron/sync-followers")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

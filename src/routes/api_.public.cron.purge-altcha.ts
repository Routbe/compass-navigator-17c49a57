import { createFileRoute } from "@tanstack/react-router";

/** Cleanup of expired ALTCHA replay rows. Protected by LOVABLE_CRON_SECRET. */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { purgeExpiredAltcha } = await import("@/lib/altcha.server");
  return Response.json({ success: true, ...(await purgeExpiredAltcha()) });
}

export const Route = createFileRoute("/api_/public/cron/purge-altcha")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

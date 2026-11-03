import { createFileRoute } from "@tanstack/react-router";

/** Delivers due outbound webhooks (signed, with backoff). Protected by LOVABLE_CRON_SECRET. */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { deliverDueWebhooks } = await import("@/lib/webhooks/webhooks.server");
  return Response.json({ success: true, ...(await deliverDueWebhooks()) });
}

export const Route = createFileRoute("/api_/public/cron/deliver-webhooks")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

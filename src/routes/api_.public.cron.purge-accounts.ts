import { createFileRoute } from "@tanstack/react-router";

/** Daily purge of accounts whose 7-day grace period ended. Protected by LOVABLE_CRON_SECRET. */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { purgeDueDeletions } = await import("@/lib/account-deletion.server");
  return Response.json({ success: true, ...(await purgeDueDeletions()) });
}

export const Route = createFileRoute("/api_/public/cron/purge-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

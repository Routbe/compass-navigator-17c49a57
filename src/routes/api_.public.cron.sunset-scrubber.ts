import { createFileRoute } from "@tanstack/react-router";

/** Deletes logins of converted accounts past their 30-day sunset. Protected by LOVABLE_CRON_SECRET. */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { scrubSunsetAccounts } = await import("@/lib/workspace-conversion.server");
  return Response.json({ success: true, ...(await scrubSunsetAccounts()) });
}

export const Route = createFileRoute("/api_/public/cron/sunset-scrubber")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

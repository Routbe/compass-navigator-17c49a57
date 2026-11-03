import { createFileRoute } from "@tanstack/react-router";

/**
 * Hourly purge of agent-provisioned workspaces whose 48-hour claim window
 * expired unclaimed: the workspace and everything in it (OAuth apps, QR
 * codes, bookings, transfers) is hard-deleted. Protected by LOVABLE_CRON_SECRET.
 */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { purgeUnclaimedAgentWorkspaces } = await import("@/lib/agent/agent-workspaces.server");
  const purged = await purgeUnclaimedAgentWorkspaces();
  return Response.json({ success: true, purged });
}

export const Route = createFileRoute("/api_/public/cron/purge-agent-workspaces")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

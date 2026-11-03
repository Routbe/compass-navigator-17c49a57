import { createFileRoute } from "@tanstack/react-router";

/**
 * Periodieke scan van openstaande overschrijvingen: houdt betalingen exact één
 * week open en verklaart ze daarna verlopen. Beveiligd met LOVABLE_CRON_SECRET.
 */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  try {
    const { runTransferWindowScan } = await import("@/lib/transfer-window.server");
    const result = await runTransferWindowScan();
    return Response.json({ success: true, ...result });
  } catch (err) {
    console.error("[cron/scan-transfers] mislukt", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Scan failed", { status: 500 });
  }
}

export const Route = createFileRoute("/api_/public/cron/scan-transfers")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

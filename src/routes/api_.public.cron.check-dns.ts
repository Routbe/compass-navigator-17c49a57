import { createFileRoute } from "@tanstack/react-router";

/**
 * Geautomatiseerde DNS-propagatiecontrole: promoot elk profiel met status
 * `pending_dns` waarvan `[handle].rout.be` naar cname.vercel-dns.com wijst.
 * Beveiligd met LOVABLE_CRON_SECRET.
 */
async function handle(request: Request) {
  const secret = process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const provided =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });

  const { runDnsPropagationCheck } = await import("@/lib/subdomain-claims.server");
  const result = await runDnsPropagationCheck();
  const { recheckDomainClaims } = await import("@/lib/domain-claims.server");
  const claims = await recheckDomainClaims().catch(() => ({ checked: 0, released: 0, error: true }));
  return Response.json({ success: true, ...result, domainClaims: claims });
}

export const Route = createFileRoute("/api_/public/cron/check-dns")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

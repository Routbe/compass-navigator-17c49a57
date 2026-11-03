import { createFileRoute } from "@tanstack/react-router";

/** Ruimt verlopen Asset Manager-bestanden op (Scaleway + Neon). Token: CRON_SECRET of LOVABLE_CRON_SECRET. */
async function handle(request: Request) {
  const secret = process.env["CRON_SECRET"] ?? process.env["LOVABLE_CRON_SECRET"];
  if (!secret) return new Response("Not configured", { status: 503 });
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("token") ??
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (provided !== secret) return new Response("Unauthorized", { status: 401 });
  const { purgeExpiredAssets } = await import("@/lib/assets.server");
  const { purgeExpiredSharedFiles } = await import("@/lib/storage/shared-files.server");
  const { purgeExpiredAltcha } = await import("@/lib/altcha.server");
  const { purgeExpiredSecurityCodes } = await import("@/lib/security-code.server");
  const { runDnsPropagationCheck } = await import("@/lib/subdomain-claims.server");
  const { qaMaintenance } = await import("@/lib/questions.server");
  // The single daily job (Vercel Hobby allows one): every purge is independent and fail-safe.
  const [assets, sharedFiles, altcha, codes, dns, qa] = await Promise.allSettled([
    purgeExpiredAssets(),
    purgeExpiredSharedFiles(),
    purgeExpiredAltcha(),
    purgeExpiredSecurityCodes(),
    runDnsPropagationCheck(),
    qaMaintenance(),
  ]);
  const pick = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? r.value : { error: true });
  return Response.json({
    assets: pick(assets),
    sharedFiles: pick(sharedFiles),
    altcha: pick(altcha),
    securityCodes: pick(codes),
    dns: pick(dns),
    qaPrivacy: pick(qa),
  });
}

export const Route = createFileRoute("/api_/public/cron/cleanup-assets")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

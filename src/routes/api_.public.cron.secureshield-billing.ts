import { createFileRoute } from "@tanstack/react-router";

/**
 * Maandelijkse afschrijving van €0,09 per actieve SecureShield-relay.
 * Wordt aangeroepen door de scheduler; beveiligd met LOVABLE_CRON_SECRET.
 */
export const Route = createFileRoute("/api_/public/cron/secureshield-billing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const provided =
          request.headers.get("x-cron-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (provided !== secret) return new Response("Unauthorized", { status: 401 });

        const { chargeMonthlyRelays } = await import("@/lib/wallet.server");
        const result = await chargeMonthlyRelays();
        return Response.json(result);
      },
    },
  },
});

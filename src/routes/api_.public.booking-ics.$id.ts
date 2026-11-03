import { createFileRoute } from "@tanstack/react-router";

/** Guest invite downloads require the per-booking token, never the booking id alone. */
export const Route = createFileRoute("/api_/public/booking-ics/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        const { sql } = await import("@/lib/neon");
        const { buildIcs } = await import("@/lib/booking-engine/ics");
        const token = new URL(request.url).searchParams.get("token");
        const { validBookingToken } = await import("@/lib/booking-engine/access");
        if (!token || !/^[a-f0-9]{64}$/.test(token)) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
        const rows = (await sql`select b.booking_token, b.ics_uid, b.sequence, b.start_utc, b.end_utc, b.guest_email, b.guest_name, t.title, t.location_kind, t.location_value
          from public.bookings b join public.booking_event_types t on t.id = b.event_type_id
          where b.id = ${params.id}::uuid and b.status = 'confirmed'`) as Record<string, string | number | null>[];
        const r = rows[0];
        if (!r) return new Response("Not found", { status: 404 });
        if (!validBookingToken(token, String(r["booking_token"] ?? ""))) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
        const loc = r["location_value"] ? String(r["location_value"]) : undefined;
        const ics = buildIcs({
          uid: String(r["ics_uid"]), sequence: Number(r["sequence"]), method: "REQUEST",
          startUtc: new Date(String(r["start_utc"])), endUtc: new Date(String(r["end_utc"])), summary: String(r["title"]),
          location: loc, url: r["location_kind"] === "video" ? loc : undefined,
          organizerEmail: "noreply@rout.be", organizerName: "ROUT", attendeeEmail: String(r["guest_email"]), attendeeName: String(r["guest_name"]),
        });
        return new Response(ics, {
          headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="rout-afspraak.ics"', "Cache-Control": "private, no-store" },
        });
      },
    },
  },
});

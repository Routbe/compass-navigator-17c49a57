import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { getNextBookingSlots } from "@/lib/booking-engine/booking.functions";
import { validBookingStart } from "@/lib/booking-engine/selection";
import BookPublic from "@/components/imported-pages/BookPublic";

export const Route = createFileRoute("/$username_/booking")({
  validateSearch: (search: Record<string, unknown>) => ({
    event: z.string().uuid().safeParse(search.event).data,
    start: validBookingStart(search.start),
  }),
  loaderDeps: ({ search }) => ({ event: search.event, start: search.start }),
  loader: async ({ params, deps }) => {
    const event = await getNextBookingSlots({ data: { handle: params.username.replace(/^@/, ""), eventTypeId: deps.event ?? null } });
    if (!event) throw notFound();
    return { eventTypeId: event.eventTypeId, title: event.title };
  },
  head: ({ loaderData }) => ({ meta: [
    { title: `${loaderData?.title ?? "Afspraak boeken"} | ROUT` },
    { name: "description", content: "Kies een beschikbaar tijdstip en boek je afspraak rechtstreeks via ROUT." },
    { property: "og:title", content: `${loaderData?.title ?? "Afspraak boeken"} | ROUT` },
    { property: "og:description", content: "Kies een beschikbaar tijdstip en boek je afspraak rechtstreeks via ROUT." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BookingRoute,
});

function BookingRoute() {
  const { eventTypeId } = Route.useLoaderData();
  const { start } = Route.useSearch();
  return <BookPublic key={`${eventTypeId}:${start ?? ""}`} eventTypeId={eventTypeId} selectedStart={start} />;
}
/** Visitor-facing reads. Only pre-computed cache + event-type rules; never guest data of others. */
import { sql } from "@/lib/neon";
import { bookableStarts } from "./bitmap";
import type { EventTypeRules } from "./types";
import { intakeFields } from "./intake";
import { validBookingToken } from "./access";

export async function publicEventType(id: string) {
  const rows = (await sql`select t.id, t.title, t.description, t.duration_minutes, t.price_cents, t.currency, t.location_kind,
      t.confirmation_mode, t.routing_strategy, t.minimum_notice_hours, t.max_days_ahead, t.slot_step_minutes,
      t.buffer_before_minutes, t.buffer_after_minutes, t.workspace_id, t.custom_fields, t.resource_capacity,
      coalesce(w.name, p.display_name) as host_name
    from public.booking_event_types t
    left join public.workspaces w on w.id = t.workspace_id
    left join public.profiles p on p.id = t.user_id
    where t.id = ${id}::uuid and t.is_active`) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r["id"]), title: String(r["title"]), description: r["description"] ? String(r["description"]) : null,
    durationMinutes: Number(r["duration_minutes"]), priceCents: r["price_cents"] == null ? null : Number(r["price_cents"]),
    currency: String(r["currency"]), locationKind: String(r["location_kind"]) as "video" | "address" | "phone",
    confirmationMode: String(r["confirmation_mode"]) as "instant" | "request", hostName: r["host_name"] ? String(r["host_name"]) : null,
    customFields: intakeFields.safeParse(r["custom_fields"] ?? []).data ?? [], capacity: Number(r["resource_capacity"] ?? 1),
    rules: {
      id: String(r["id"]), workspaceId: (r["workspace_id"] as string | null) ?? null,
      durationMinutes: Number(r["duration_minutes"]), bufferBeforeMinutes: Number(r["buffer_before_minutes"]),
      bufferAfterMinutes: Number(r["buffer_after_minutes"]), minimumNoticeHours: Number(r["minimum_notice_hours"]),
      maxDaysAhead: Number(r["max_days_ahead"]), slotStepMinutes: Number(r["slot_step_minutes"]),
      routingStrategy: String(r["routing_strategy"]) as EventTypeRules["routingStrategy"],
    },
  };
}

/** Free starts (UTC ISO) for the horizon. COLLECTIVE = AND of hosts, otherwise OR (any host free). */
export async function publicSlots(id: string, now = new Date()): Promise<string[]> {
  const et = await publicEventType(id);
  if (!et) return [];
  const collective = et.rules.routingStrategy === "COLLECTIVE";
  await refreshStaleHosts(id, now);
  const days = (await sql`select c.day::text as day,
      (case when ${collective} then bit_and(c.free_bits) else bit_or(c.free_bits) end)::text as bits,
      count(*)::int as hosts
    from public.availability_cache c
    join public.booking_event_type_hosts h on h.user_id = c.user_id and h.event_type_id = ${id}::uuid
    where c.day >= (now() at time zone 'utc')::date
    group by c.day order by c.day`) as { day: string; bits: string; hosts: number }[];
  const total = (await sql`select count(*)::int as n from public.booking_event_type_hosts where event_type_id = ${id}::uuid`) as { n: number }[];
  const usable = days.filter((d) => !collective || d.hosts === total[0]!.n); // collective: a host without cache = busy
  const rules = { ...et.rules, confirmationMode: et.confirmationMode, priceCents: et.priceCents, currency: et.currency, title: et.title, locationKind: et.locationKind, locationValue: null } as EventTypeRules;
  // Days must be consecutive for buffer math across midnight; fill gaps as busy.
  const filled: { day: string; bits: string }[] = [];
  if (usable.length) {
    const start = new Date(`${usable[0]!.day}T00:00:00Z`);
    const end = new Date(`${usable[usable.length - 1]!.day}T00:00:00Z`);
    const map = new Map(usable.map((d) => [d.day, d.bits]));
    for (let t = start; t <= end; t = new Date(t.getTime() + 86400000)) {
      const k = t.toISOString().slice(0, 10);
      filled.push({ day: k, bits: map.get(k) ?? "0".repeat(96) });
    }
  }
  return bookableStarts(filled, rules, now).map((d) => d.toISOString());
}

/**
 * Confirmation view. The booking id alone is NOT a capability (db/0144):
 * guest PII is only returned with the high-entropy `booking_token` that the
 * guest receives after booking. Without a valid token the response is masked:
 * status/times/title only, never guest name, timezone or location.
 */
export async function bookingSummary(id: string, token?: string | null) {
  const rows = (await sql`select b.id, b.status, b.start_utc, b.end_utc, b.guest_name, b.guest_timezone,
      b.booking_token, t.title, t.location_kind,
      case when b.status = 'confirmed' then t.location_value end as location_value
    from public.bookings b join public.booking_event_types t on t.id = b.event_type_id where b.id = ${id}::uuid`) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  const base = {
    id: String(r["id"]), status: String(r["status"]), title: String(r["title"]),
    startUtc: new Date(String(r["start_utc"])).toISOString(),
    endUtc: new Date(String(r["end_utc"])).toISOString(),
    locationKind: String(r["location_kind"]),
  };
  const storedToken = r["booking_token"] ? String(r["booking_token"]) : null;
  // Constant-time vergelijking zonder node:crypto (workerd-compatibel).
  const tokenOk = validBookingToken(token, storedToken);
  if (!tokenOk) {
    // Gemaskerde publieke status-check: geen gast-PII, geen locatie.
    return { ...base, guestName: null, guestTimezone: null, locationValue: null, masked: true as const };
  }
  return {
    ...base, masked: false as const,
    guestName: String(r["guest_name"]),
    guestTimezone: String(r["guest_timezone"]),
    locationValue: r["location_value"] ? String(r["location_value"]) : null,
  };
}

/** Het gasttoken van een zojuist aangemaakte boeking (alleen direct na insert). */
export async function bookingTokenFor(id: string): Promise<string | null> {
  const rows = (await sql`select booking_token from public.bookings where id = ${id}::uuid`) as {
    booking_token: string | null;
  }[];
  return rows[0]?.booking_token ?? null;
}

/** Lazy fallback: recompute hosts whose cache is missing or older than 5 minutes, bounded so a page stays fast. */
async function refreshStaleHosts(eventTypeId: string, now: Date): Promise<void> {
  try {
    const { isAvailabilityStale, LAZY_RECOMPUTE_MAX_HOSTS } = await import("./staleness");
    const hosts = (await sql`select h.user_id::text as user_id, max(c.computed_at)::text as computed_at
      from public.booking_event_type_hosts h
      left join public.availability_cache c on c.user_id = h.user_id
      where h.event_type_id = ${eventTypeId}::uuid group by h.user_id`) as { user_id: string; computed_at: string | null }[];
    const stale = hosts.filter((h) => isAvailabilityStale(h.computed_at, now)).slice(0, LAZY_RECOMPUTE_MAX_HOSTS);
    if (!stale.length) return;
    const { recomputeUser } = await import("./recompute.server");
    await Promise.all(stale.map((h) => recomputeUser(h.user_id, now).catch((e) => {
      console.error("[booking] lazy recompute failed", e instanceof Error ? e.message : "unknown");
    })));
  } catch (e) {
    console.error("[booking] stale check failed", e instanceof Error ? e.message : "unknown");
  }
}

/** Smart widget: the first `n` open starts of an active type on a public profile (cache only, no guest data). */
export async function nextPublicSlots(handle: string, eventTypeId: string | null, n = 3) {
  const rows = (await sql`select t.id::text as id, t.title from public.booking_event_types t
    join public.profiles p on p.id = t.user_id
    where lower(p.username) = lower(${handle}) and t.is_active
      and coalesce((p.display_prefs ->> 'publicProfile')::boolean, true)
      and not coalesce(p.is_banned, false) and not coalesce(p.is_suspended, false)
      and (${eventTypeId}::uuid is null or t.id = ${eventTypeId}::uuid)
    order by t.created_at limit 1`) as { id: string; title: string }[];
  const t = rows[0];
  if (!t) return null;
  return { eventTypeId: t.id, title: t.title, slots: (await publicSlots(t.id)).slice(0, Math.min(5, n)) };
}

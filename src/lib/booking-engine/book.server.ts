/**
 * Transactional booking. Each attempt is ONE gateway batch = one transaction:
 *   1. pg_advisory_xact_lock per (host, UTC day) — serializes every booking that
 *      could overlap on that host/day, released automatically at commit/rollback.
 *   2. wt_assert(no active booking / blocking event overlaps the block range).
 *   3. insert. The GiST EXCLUDE constraint is the last line of defence.
 * A loser fails with 'slot_taken' (assert) or 23P01 (exclusion) → mapped to slot_taken.
 */
import { sql } from "@/lib/neon";
import { blockRange } from "./bitmap";
import { roundRobinOrder, type HostCandidate } from "./routing";
import { ACTIVE_BOOKING_STATUSES, type BookingOutcome, type BookingRequest, type EventTypeRules } from "./types";
import { isoDay } from "./time";
import { intakeFields, splitSensitive, validateIntake, type IntakeField } from "./intake";

const HOLD_MINUTES = 30; // Stripe Checkout's minimum session lifetime

export function isSlotTakenError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; body?: string };
  const text = `${e?.message ?? ""} ${e?.body ?? ""}`;
  return e?.code === "23P01" || /23P01|slot_taken|bookings_no_overlap/.test(text);
}

/** Lock key per host per UTC day; also used in sorted order for collective bookings (no deadlocks). */
export const lockKey = (hostUserId: string, startUtc: Date) => `booking:${hostUserId}:${isoDay(startUtc)}`;

async function loadEventType(id: string): Promise<(EventTypeRules & { isActive: boolean; capacity: number; customFields: IntakeField[]; hosts: { userId: string; priority: number }[] }) | null> {
  const rows = (await sql`select id, workspace_id, duration_minutes, buffer_before_minutes, buffer_after_minutes,
      minimum_notice_hours, max_days_ahead, slot_step_minutes, confirmation_mode, price_cents, currency,
      routing_strategy, title, location_kind, location_value, is_active, resource_capacity, custom_fields,
      coalesce((select json_agg(json_build_object('userId', h.user_id, 'priority', h.priority))
        from public.booking_event_type_hosts h where h.event_type_id = t.id), '[]'::json) as hosts
    from public.booking_event_types t where id = ${id}::uuid`) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r["id"]),
    workspaceId: (r["workspace_id"] as string | null) ?? null,
    durationMinutes: Number(r["duration_minutes"]),
    bufferBeforeMinutes: Number(r["buffer_before_minutes"]),
    bufferAfterMinutes: Number(r["buffer_after_minutes"]),
    minimumNoticeHours: Number(r["minimum_notice_hours"]),
    maxDaysAhead: Number(r["max_days_ahead"]),
    slotStepMinutes: Number(r["slot_step_minutes"]),
    confirmationMode: r["confirmation_mode"] as EventTypeRules["confirmationMode"],
    priceCents: r["price_cents"] == null ? null : Number(r["price_cents"]),
    currency: String(r["currency"]),
    routingStrategy: r["routing_strategy"] as EventTypeRules["routingStrategy"],
    title: String(r["title"]),
    locationKind: r["location_kind"] as EventTypeRules["locationKind"],
    locationValue: (r["location_value"] as string | null) ?? null,
    isActive: Boolean(r["is_active"]),
    capacity: Math.max(1, Number(r["resource_capacity"] ?? 1)),
    customFields: intakeFields.safeParse(r["custom_fields"] ?? []).data ?? [],
    hosts: (r["hosts"] as { userId: string; priority: number }[]) ?? [],
  };
}

/** Is the host free for the block range right now (live, not cached)? Used to rank round-robin candidates. */
async function freeAndLoad(hostIds: string[], blockStart: Date, blockEnd: Date, monthStart: Date, monthEnd: Date) {
  const rows = (await sql`select u.id::text as user_id,
      not exists (select 1 from public.bookings b where b.host_user_id = u.id
        and b.status = any(${ACTIVE_BOOKING_STATUSES as unknown as string[]})
        and tstzrange(b.block_start_utc, b.block_end_utc, '[)') && tstzrange(${blockStart.toISOString()}::timestamptz, ${blockEnd.toISOString()}::timestamptz, '[)'))
      and not exists (select 1 from public.calendar_events e join public.connected_calendars c on c.id = e.calendar_id
        where c.user_id = u.id and e.is_blocking and e.start_utc < ${blockEnd.toISOString()}::timestamptz and e.end_utc > ${blockStart.toISOString()}::timestamptz) as is_free,
      (select count(*) from public.bookings b where b.host_user_id = u.id
        and b.status = any(${ACTIVE_BOOKING_STATUSES as unknown as string[]})
        and b.start_utc >= ${monthStart.toISOString()}::timestamptz and b.start_utc < ${monthEnd.toISOString()}::timestamptz) as n
    from public.users u where u.id = any(${hostIds}::uuid[])`) as { user_id: string; is_free: boolean; n: string }[];
  return rows;
}

function bookingStatements(p: {
  hostIds: string[]; eventTypeId: string; workspaceId: string | null; groupId: string | null;
  range: ReturnType<typeof blockRange>; status: string; req: BookingRequest; holdExpires: Date | null; bookingIds: string[];
  capacity: number; intake: string | null;
}) {
  const shared = p.capacity > 1;
  const s = p.range.startUtc.toISOString(), e = p.range.endUtc.toISOString();
  const bs = p.range.blockStartUtc.toISOString(), be = p.range.blockEndUtc.toISOString();
  const sorted = [...p.hostIds].sort();
  const stmts: ReturnType<typeof sql>[] = [];
  for (const h of sorted) stmts.push(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey(h, p.range.startUtc)}, 0))`);
  for (const h of sorted) {
    // Exclusive: nothing may overlap. Shared: only same-type, same-start seats may overlap, up to capacity.
    stmts.push(sql`select public.wt_assert(not exists (
        select 1 from public.bookings b where b.host_user_id = ${h}::uuid
          and b.status in ('held','pending_payment','requested','confirmed')
          and tstzrange(b.block_start_utc, b.block_end_utc, '[)') && tstzrange(${bs}::timestamptz, ${be}::timestamptz, '[)')
          and not (${shared} and b.shared_slot and b.event_type_id = ${p.eventTypeId}::uuid and b.start_utc = ${s}::timestamptz))
      and (select count(*) from public.bookings b where b.host_user_id = ${h}::uuid and b.shared_slot
          and b.event_type_id = ${p.eventTypeId}::uuid and b.start_utc = ${s}::timestamptz
          and b.status in ('held','pending_payment','requested','confirmed')) < ${p.capacity}
      and not exists (
        select 1 from public.calendar_events ev join public.connected_calendars c on c.id = ev.calendar_id
        where c.user_id = ${h}::uuid and ev.is_blocking and ev.start_utc < ${be}::timestamptz and ev.end_utc > ${bs}::timestamptz),
      'slot_taken')`);
  }
  p.hostIds.forEach((h, i) => {
    stmts.push(sql`insert into public.bookings (id, event_type_id, host_user_id, workspace_id, group_id, start_utc, end_utc,
        block_start_utc, block_end_utc, status, guest_name, guest_email, guest_timezone, guest_note, hold_expires_at, ics_uid, shared_slot, intake_answers)
      values (${p.bookingIds[i]}::uuid, ${p.eventTypeId}::uuid, ${h}::uuid, ${p.workspaceId}, ${p.groupId}, ${s}::timestamptz, ${e}::timestamptz,
        ${bs}::timestamptz, ${be}::timestamptz, ${p.status}, ${p.req.guestName}, ${p.req.guestEmail}, ${p.req.guestTimezone},
        ${p.req.guestNote}, ${p.holdExpires?.toISOString() ?? null}, ${`${p.groupId ?? p.bookingIds[i]}@rout.be`}, ${shared}, ${p.intake}::jsonb)`);
    stmts.push(sql`insert into public.availability_jobs (user_id, reason, run_after) values (${h}::uuid, 'booking', now() + interval '20 seconds')
      on conflict (user_id) do update set reason = 'booking', run_after = least(public.availability_jobs.run_after, excluded.run_after)`);
  });
  return stmts;
}

/** Try to book; never throws for a lost race. */
export async function bookSlot(req: BookingRequest, now = new Date()): Promise<BookingOutcome> {
  const et = await loadEventType(req.eventTypeId);
  if (!et || !et.isActive || et.hosts.length === 0) return { ok: false, reason: "inactive" };
  const startUtc = new Date(req.startUtc);
  if (startUtc.getTime() % (et.slotStepMinutes * 60000) !== 0) return { ok: false, reason: "outside_availability" };
  if (startUtc.getTime() < now.getTime() + et.minimumNoticeHours * 3600000) return { ok: false, reason: "too_soon" };
  if (startUtc.getTime() > now.getTime() + et.maxDaysAhead * 86400000) return { ok: false, reason: "too_far" };
  const paid = et.priceCents != null;
  if (paid && !process.env["STRIPE_SECRET_KEY"]) return { ok: false, reason: "payment_unavailable" };

  const checked = validateIntake(et.customFields, req.intakeAnswers ?? {});
  if (!checked.ok) return { ok: false, reason: "invalid_intake" };
  let intake: string | null = null;
  if (Object.keys(checked.answers).length) {
    const { plain, secret } = splitSensitive(et.customFields, checked.answers);
    const stored: Record<string, unknown> = { v: 1, plain };
    if (Object.keys(secret).length) {
      // Sensitive answers are sealed (AES-GCM) bound to the event type; never logged or sent to third parties.
      const { seal, encryptionConfigured } = await import("@/lib/crypto/secretbox.server");
      if (!encryptionConfigured()) return { ok: false, reason: "invalid_intake" };
      stored["sealed"] = await seal(JSON.stringify(secret), `intake:${et.id}`);
    }
    intake = JSON.stringify(stored);
  }
  const range = blockRange(startUtc, et);
  const status = paid ? "pending_payment" : et.confirmationMode === "request" ? "requested" : "confirmed";
  const holdExpires = paid ? new Date(now.getTime() + HOLD_MINUTES * 60000) : null;

  // Which host set(s) to try, in order.
  let attempts: string[][];
  if (et.routingStrategy === "COLLECTIVE") attempts = [et.hosts.map((h) => h.userId)];
  else if (et.routingStrategy === "ROUND_ROBIN") {
    const monthStart = new Date(Date.UTC(startUtc.getUTCFullYear(), startUtc.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(startUtc.getUTCFullYear(), startUtc.getUTCMonth() + 1, 1));
    const rows = await freeAndLoad(et.hosts.map((h) => h.userId), range.blockStartUtc, range.blockEndUtc, monthStart, monthEnd);
    const candidates: HostCandidate[] = rows.map((r) => ({
      userId: r.user_id, isFree: r.is_free, bookingsThisMonth: Number(r.n),
      priority: et.hosts.find((h) => h.userId === r.user_id)?.priority ?? 0,
    }));
    attempts = roundRobinOrder(candidates).map((id) => [id]);
  } else attempts = [[et.hosts[0]!.userId]];
  if (attempts.length === 0) return { ok: false, reason: "slot_taken" };

  for (const hostIds of attempts) {
    const bookingIds = hostIds.map(() => crypto.randomUUID());
    const groupId = hostIds.length > 1 ? crypto.randomUUID() : null;
    try {
      await sql.transaction(bookingStatements({ hostIds, eventTypeId: et.id, workspaceId: et.workspaceId, groupId, range, status, req, holdExpires, bookingIds, capacity: et.capacity, intake }));
    } catch (err) {
      if (isSlotTakenError(err)) continue; // round robin: next least-loaded host
      throw err;
    }
    // Gasttoken (db/0144): de bevestigingslink toont PII alleen met dit token.
    const tokenRows = (await sql`select booking_token from public.bookings where id = ${bookingIds[0]}::uuid`) as {
      booking_token: string | null;
    }[];
    const bookingToken = tokenRows[0]?.booking_token ?? null;
    let checkoutUrl: string | null = null;
    if (paid) {
      checkoutUrl = await createCheckoutHold(bookingIds[0]!, et, req, holdExpires!, bookingToken).catch(async (e: unknown) => {
        console.error("[booking] checkout", e instanceof Error ? e.message : "error");
        await releaseBookingHold(bookingIds[0]!);
        return null;
      });
      if (!checkoutUrl) return { ok: false, reason: "payment_unavailable" };
    }
    if (status === "confirmed") {
      const { sendBookingInvite } = await import("./invite.server");
      void sendBookingInvite(bookingIds[0]!);
    }
    return { ok: true, bookingIds, bookingToken, status, hostUserIds: hostIds, checkoutUrl };
  }
  return { ok: false, reason: "slot_taken" };
}

async function createCheckoutHold(bookingId: string, et: EventTypeRules, req: BookingRequest, expires: Date, bookingToken: string | null): Promise<string> {
  const site = (process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "");
  const body = new URLSearchParams({
    mode: "payment",
    customer_email: req.guestEmail,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": et.currency,
    "line_items[0][price_data][unit_amount]": String(et.priceCents),
    "line_items[0][price_data][product_data][name]": et.title,
    "metadata[kind]": "booking",
    "metadata[booking_id]": bookingId,
    "payment_intent_data[metadata][booking_id]": bookingId,
    expires_at: String(Math.floor(expires.getTime() / 1000) + 5),
    success_url: `${site}/booking/${bookingId}?paid=1${bookingToken ? `&token=${bookingToken}` : ""}`,
    cancel_url: `${site}/booking/${bookingId}?cancelled=1`,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env["STRIPE_SECRET_KEY"]}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `booking-${bookingId}` },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`stripe ${res.status}: ${text.slice(0, 300)}`);
  const session = JSON.parse(text) as { id: string; url: string };
  await sql`update public.bookings set stripe_checkout_session_id = ${session.id}, updated_at = now() where id = ${bookingId}::uuid`;
  return session.url;
}

/** Webhook: payment done → confirmed (or requested when the owner must still accept). Idempotent. */
export async function confirmPaidBooking(bookingId: string, sessionId: string): Promise<string> {
  const rows = (await sql`update public.bookings b set
      status = case when t.confirmation_mode = 'request' then 'requested' else 'confirmed' end,
      hold_expires_at = null, stripe_checkout_session_id = coalesce(b.stripe_checkout_session_id, ${sessionId}), updated_at = now()
    from public.booking_event_types t
    where b.id = ${bookingId}::uuid and t.id = b.event_type_id and b.status = 'pending_payment'
    returning b.status`) as { status: string }[];
  if (rows[0]?.status === "confirmed") {
    const { sendBookingInvite } = await import("./invite.server");
    void sendBookingInvite(bookingId);
  }
  return rows[0]?.status ?? "noop";
}

export async function releaseBookingHold(bookingId: string): Promise<string> {
  const rows = (await sql`update public.bookings set status = 'cancelled', hold_expires_at = null, updated_at = now()
    where id = ${bookingId}::uuid and status in ('held','pending_payment') returning host_user_id`) as { host_user_id: string }[];
  for (const r of rows)
    await sql`insert into public.availability_jobs (user_id, reason) values (${r.host_user_id}::uuid, 'hold_released')
      on conflict (user_id) do update set run_after = least(public.availability_jobs.run_after, now())`;
  return rows.length ? "released" : "noop";
}

/** Cron safety net for holds whose Stripe expiry webhook never arrived. */
export async function releaseExpiredHolds(): Promise<number> {
  const rows = (await sql`select id from public.bookings where status in ('held','pending_payment') and hold_expires_at < now() - interval '5 minutes' limit 500`) as { id: string }[];
  for (const r of rows) await releaseBookingHold(r.id);
  return rows.length;
}

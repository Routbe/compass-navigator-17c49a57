import { sql } from "@/lib/neon";
import { validBookingToken } from "./access";

/** One authorization boundary for detail API: identity never comes from query input. */
export async function readBookingDetails(id: string, token: string | null, userId: string | null) {
  const rows = await sql.query(`select b.id, b.status, b.start_utc, b.end_utc, b.guest_name, b.guest_email, b.guest_note,
    b.host_user_id, b.workspace_id, b.booking_token, t.title, t.location_value,
    coalesce(w.name,p.display_name) as host_name,
    exists(select 1 from public.workspace_members m where m.workspace_id=b.workspace_id and m.user_id=$2::uuid and m.role in ('owner','admin')) as workspace_admin
    from public.bookings b join public.booking_event_types t on t.id=b.event_type_id
    left join public.workspaces w on w.id=b.workspace_id left join public.profiles p on p.id=b.host_user_id
    where b.id=$1::uuid limit 1`, [id, userId]) as Record<string, unknown>[];
  const b = rows[0]; if (!b) return null;
  const host = Boolean(userId && (b.workspace_id ? b.workspace_admin === true : b.host_user_id === userId));
  const guest = validBookingToken(token, typeof b.booking_token === "string" ? b.booking_token : null);
  if (!host && !guest) return { forbidden: true as const };
  return { forbidden: false as const, id: b.id, status: b.status, start_at: b.start_utc, end_at: b.end_utc,
    host_name: b.host_name ?? null, guest_name: b.guest_name, guest_email: b.guest_email,
    meeting_notes: host ? b.guest_note ?? null : null,
    location: b.status === "confirmed" || host ? b.location_value ?? null : null, title: b.title };
}
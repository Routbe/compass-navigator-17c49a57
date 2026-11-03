/**
 * Minimal, busy-only iCalendar reader. Reads only UID, DTSTART, DTEND/DURATION,
 * TRANSP, STATUS, RRULE (DAILY/WEEKLY, INTERVAL, COUNT, UNTIL, BYDAY) and EXDATE.
 * SUMMARY, DESCRIPTION, ATTENDEE, LOCATION … are never even extracted.
 */
import { addMinutes, zonedToUtc } from "../time";
import type { RawExternalEvent } from "./zero-knowledge";

const READ = new Set(["UID", "DTSTART", "DTEND", "DURATION", "TRANSP", "STATUS", "RRULE", "EXDATE", "RECURRENCE-ID"]);
const MAX_OCCURRENCES = 2000;

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]|\n[ \t]/g, "").split(/\r?\n/);
}

/** Parse a DATE or DATE-TIME value with optional TZID into UTC. Floating times use `fallbackTz`. */
export function parseIcsDate(value: string, params: Record<string, string>, fallbackTz: string): { at: Date; allDay: boolean } | null {
  const v = value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || params["VALUE"] === "DATE") {
    m = m ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { at: zonedToUtc(+m[1]!, +m[2]!, +m[3]!, 0, params["TZID"] ?? fallbackTz), allDay: true };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  if (m[7] === "Z") return { at: new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!)), allDay: false };
  const tz = params["TZID"] ?? fallbackTz;
  try {
    return { at: new Date(zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]! * 60 + +m[5]!, tz).getTime() + +m[6]! * 1000), allDay: false };
  } catch {
    return { at: new Date(zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]! * 60 + +m[5]!, "UTC").getTime()), allDay: false };
  }
}

function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const mins = (+(m[2] ?? 0)) * 10080 + (+(m[3] ?? 0)) * 1440 + (+(m[4] ?? 0)) * 60 + (+(m[5] ?? 0)) + (+(m[6] ?? 0)) / 60;
  return m[1] === "-" ? -mins : mins;
}

type Prop = { name: string; params: Record<string, string>; value: string };
function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: (name ?? "").toUpperCase(), params, value: line.slice(colon + 1) };
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function expand(start: Date, rrule: string, windowEnd: Date, exdates: Set<number>): Date[] {
  const r = Object.fromEntries(rrule.split(";").map((kv) => kv.split("=") as [string, string]));
  const freq = r["FREQ"];
  if (freq !== "DAILY" && freq !== "WEEKLY") return [start];
  const interval = Math.max(1, Number(r["INTERVAL"] ?? 1));
  const count = r["COUNT"] ? Number(r["COUNT"]) : Infinity;
  const until = r["UNTIL"] ? parseIcsDate(r["UNTIL"], {}, "UTC")?.at ?? windowEnd : windowEnd;
  const end = until < windowEnd ? until : windowEnd;
  const byDay = (r["BYDAY"] ?? "").split(",").filter(Boolean).map((d) => DAY_CODES.indexOf(d.slice(-2)));
  const out: Date[] = [];
  let n = 0;
  for (let d = 0; out.length < MAX_OCCURRENCES && n < count; d++) {
    const at = addMinutes(start, d * 1440);
    if (at > end) break;
    const weeks = Math.floor(d / 7);
    const ok = freq === "DAILY" ? d % interval === 0 : weeks % interval === 0 && (byDay.length ? byDay.includes(at.getUTCDay()) : d % 7 === 0);
    if (!ok) continue;
    n++;
    if (!exdates.has(at.getTime())) out.push(at);
  }
  return out;
}

/** Busy-only events overlapping [windowStart, windowEnd). */
export function parseIcsBusy(text: string, windowStart: Date, windowEnd: Date, fallbackTz = "UTC"): RawExternalEvent[] {
  const out: RawExternalEvent[] = [];
  let cur: Prop[] | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line)) { cur = []; depth = 0; continue; }
    if (cur && /^BEGIN:/i.test(line)) { depth++; continue; } // VALARM etc.
    if (cur && /^END:/i.test(line) && depth > 0) { depth--; continue; }
    if (/^END:VEVENT$/i.test(line) && cur) {
      const get = (n: string) => cur!.find((p) => p.name === n);
      const ds = get("DTSTART");
      const start = ds ? parseIcsDate(ds.value, ds.params, fallbackTz) : null;
      if (start) {
        const de = get("DTEND");
        const dur = get("DURATION");
        let lengthMin: number;
        if (de) {
          const e = parseIcsDate(de.value, de.params, fallbackTz);
          lengthMin = e ? (e.at.getTime() - start.at.getTime()) / 60000 : 0;
        } else if (dur) lengthMin = parseDuration(dur.value) ?? 0;
        else lengthMin = start.allDay ? 1440 : 0;
        const exdates = new Set<number>();
        for (const p of cur.filter((p) => p.name === "EXDATE"))
          for (const v of p.value.split(",")) { const x = parseIcsDate(v, p.params, fallbackTz); if (x) exdates.add(x.at.getTime()); }
        const rr = get("RRULE");
        const starts = rr ? expand(start.at, rr.value, windowEnd, exdates) : [start.at];
        const uid = get("UID")?.value ?? `${start.at.getTime()}`;
        const transparent = get("TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT";
        const cancelled = get("STATUS")?.value.trim().toUpperCase() === "CANCELLED";
        if (lengthMin > 0) {
          for (const s of starts) {
            const e = addMinutes(s, lengthMin);
            if (e > windowStart && s < windowEnd) out.push({ externalId: uid, startUtc: s, endUtc: e, transparent, cancelled });
          }
        }
      }
      cur = null;
      continue;
    }
    if (cur && depth === 0) {
      const p = parseLine(line);
      if (p && READ.has(p.name)) cur.push(p);
    }
  }
  return out;
}

/** Timezone math without libraries: IANA zone → UTC via Intl, DST-safe. */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of a UTC instant in `tz`. */
export function wallParts(utc: Date, tz: string) {
  const parts = Object.fromEntries(fmt(tz).formatToParts(utc).map((p) => [p.type, p.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts["weekday"] ?? "");
  return {
    year: Number(parts["year"]), month: Number(parts["month"]), day: Number(parts["day"]),
    hour: Number(parts["hour"]), minute: Number(parts["minute"]), second: Number(parts["second"]), weekday,
  };
}

/** Offset of `tz` at `utc`, in minutes (Brussels summer = +120). */
export function offsetMinutes(utc: Date, tz: string): number {
  const p = wallParts(utc, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utc.getTime() / 1000) * 1000) / 60000);
}

/**
 * Wall time (y-m-d + minute of day) in `tz` → UTC instant. Times that don't
 * exist (spring-forward gap) shift forward; ambiguous ones take the first.
 */
export function zonedToUtc(year: number, month: number, day: number, minuteOfDay: number, tz: string): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  let guess = naive - offsetMinutes(new Date(naive), tz) * 60000;
  const second = naive - offsetMinutes(new Date(guess), tz) * 60000;
  if (second !== guess) guess = Math.min(guess, second);
  return new Date(guess);
}

export const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

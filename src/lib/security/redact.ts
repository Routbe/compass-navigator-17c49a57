/**
 * Universele log-redactie (pure functies, geen I/O).
 *
 * Elke server-logger die payloads van externe providers (bunq, Stripe, Mollie,
 * OAuth) of gebruikersdata logt, moet eerst door `redactLogPayload`. Zo kan een
 * betalings-credential of e-mailadres nooit ongemaskeerd in de logs belanden.
 */

/** Sleutels die altijd volledig geredacteerd worden (case-insensitive). */
const SENSITIVE_KEY_RE =
  /secret|token|key|authorization|password|credential|stripe|mollie|signature|session|cookie/i;

const EMAIL_RE = /([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)(@)([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Maskeert een e-mailadres: "jonas@rout.be" → "j***s@rout.be". */
export function maskEmail(email: string): string {
  return email.replace(EMAIL_RE, (_m, first: string, rest: string, at: string, domain: string) => {
    const last = rest.length > 0 ? rest[rest.length - 1]! : "";
    return `${first}***${last}${at}${domain}`;
  });
}

/** Maskeert alle e-mailadressen in een vrije tekst. */
export function maskEmailsInText(text: string): string {
  return text.replace(EMAIL_RE, (m) => maskEmail(m));
}

function redactString(value: string): string {
  return maskEmailsInText(value);
}

function redactAny(value: unknown, keyHint: string | null, depth: number): unknown {
  if (depth > 6) return "[truncated]";
  if (keyHint !== null && SENSITIVE_KEY_RE.test(keyHint)) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactAny(v, null, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactAny(v, k, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * Redacteert een willekeurige log-payload: gevoelige sleutels worden
 * "[redacted]", e-mailadressen in strings worden gemaskeerd.
 */
export function redactLogPayload<T>(payload: T): T {
  return redactAny(payload, null, 0) as T;
}

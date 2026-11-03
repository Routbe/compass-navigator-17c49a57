/**
 * ensureStepUpSession: sensitive actions need a passkey/TOTP (or, without those,
 * e-mail code) verification of at most 120 s old, proven by an HMAC-signed HttpOnly cookie.
 */
import {
  STEP_UP_COOKIE,
  STEP_UP_MAX_AGE_SEC,
  STEP_UP_REQUIRED,
  allowedStepUpMethods,
  checkStepUpPayload,
  stepUpPayload,
  type StepUpAction,
  type StepUpMethod,
} from "@/lib/auth/step-up-rules";
import { hmacSha256Hex } from "@/lib/audit-chain";

export class StepUpRequiredError extends Error {
  status = 401;
  constructor() {
    super(STEP_UP_REQUIRED);
  }
}

async function secret(): Promise<string> {
  const { resolveAuthSecret } = await import("@/lib/better-auth.server");
  const s = resolveAuthSecret();
  if (!s) throw new Error("auth secret missing");
  return `stepup:${s.secret}`;
}

async function sign(payload: string) {
  return `${payload}.${await hmacSha256Hex(await secret(), payload)}`;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Checks a raw cookie value; exported for tests. */
export async function verifyStepUpCookie(raw: string | null | undefined, userId: string, nowSec = Math.floor(Date.now() / 1000)) {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const payload = raw.slice(0, i);
  if (!safeEqual(raw.slice(i + 1), await hmacSha256Hex(await secret(), payload))) return null;
  return checkStepUpPayload(payload, userId, nowSec);
}

export async function enrolledFactors(userId: string) {
  const { sql } = await import("@/lib/neon");
  const rows = (await sql`
    select coalesce(bu."twoFactorEnabled", false) as totp,
           exists (select 1 from neon_auth.passkey p where p."userId" = bu.id) as passkey
    from public.users u
    left join neon_auth."user" bu on bu.id::text = coalesce(u.auth_user_id::text, u.user_metadata->>'neon_auth_id')
    where u.id = ${userId} limit 1`) as { totp: boolean | null; passkey: boolean | null }[];
  return { totp: Boolean(rows[0]?.totp), passkey: Boolean(rows[0]?.passkey) };
}

/** Throws StepUpRequiredError (401) unless a fresh step-up proof exists. */
export async function ensureStepUpSession(userId: string, action: StepUpAction, readCookie?: () => string | undefined) {
  let raw: string | undefined;
  if (readCookie) raw = readCookie();
  else {
    const { getCookie } = await import("@tanstack/react-start/server");
    raw = getCookie(STEP_UP_COOKIE);
  }
  const method = await verifyStepUpCookie(raw, userId);
  if (!method) {
    if (!readCookie) {
      try {
        const { setResponseStatus } = await import("@tanstack/react-start/server");
        setResponseStatus(401);
      } catch {
        /* not inside a request */
      }
    }
    throw new StepUpRequiredError();
  }
  const { recordSecurityEvent } = await import("@/lib/audit-log.server");
  void recordSecurityEvent({ eventType: `step_up.used.${action}`, userId, payload: { method } });
  return method;
}

export async function grantStepUp(userId: string, method: StepUpMethod, emitCookie?: (name: string, value: string) => void) {
  const allowed = allowedStepUpMethods(await enrolledFactors(userId));
  if (!allowed.includes(method)) throw new Error("Deze verificatiemethode is niet toegestaan voor je account.");
  const value = await sign(stepUpPayload(userId, method, Math.floor(Date.now() / 1000)));
  if (emitCookie) emitCookie(STEP_UP_COOKIE, value);
  else {
    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(STEP_UP_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: STEP_UP_MAX_AGE_SEC,
    });
  }
  const { recordSecurityEvent } = await import("@/lib/audit-log.server");
  void recordSecurityEvent({ eventType: "step_up.granted", userId, payload: { method } });
}

import { sql } from "@/lib/neon";
import { hashToken } from "@/lib/auth/password.server";
import { generateOtp } from "@/lib/phone/otp-rules";

/**
 * Six-digit e-mail codes for sensitive account changes (merge, password,
 * 2FA). Stored only as digests, 10 minutes, max 5 tries, single use.
 */
export type SecurityPurpose = "merge" | "password" | "two_factor" | "workspace_convert" | "delete_account" | "identity_link" | "step_up";

const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

async function emailOf(userId: string): Promise<string | null> {
  const rows = (await sql`select email from public.users where id = ${userId} limit 1`) as { email: string | null }[];
  return rows[0]?.email ?? null;
}

export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export async function issueSecurityCode(userId: string, purpose: SecurityPurpose, request?: Request | null) {
  const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
  const limit = await hitRateLimit("security-code", `${userId}:${purpose}`, { limit: 5, windowSec: 15 * 60 });
  if (!limit.ok) return { ok: false as const, reason: "rate_limited" as const };
  const email = await emailOf(userId);
  if (!email) return { ok: false as const, reason: "no_email" as const };
  const code = generateOtp();
  // Lazy cleanup: verification already ignores expired rows; old ones are dropped here, non-blocking.
  void purgeExpiredSecurityCodes().catch(() => undefined);
  await sql`update public.security_codes set consumed_at = now()
    where user_id = ${userId} and purpose = ${purpose} and consumed_at is null`;
  await sql`insert into public.security_codes (user_id, purpose, code_hash, expires_at)
    values (${userId}, ${purpose}, ${await hashToken(`${userId}:${purpose}:${code}`)}, now() + make_interval(mins => ${TTL_MIN}))`;
  const { sendLocalizedEmail, localeFromRequest } = await import("@/lib/email.server");
  await sendLocalizedEmail({ to: email, intent: "verification", locale: localeFromRequest(request ?? null), payload: { code } });
  return { ok: true as const, sentTo: maskEmail(email) };
}

/** Deletes codes that expired over 30 minutes ago or were already used. */
export async function purgeExpiredSecurityCodes(): Promise<{ deleted: number }> {
  const rows = (await sql`delete from public.security_codes
    where expires_at < now() - interval '30 minutes' or consumed_at < now() - interval '30 minutes'
    returning 1`) as unknown[];
  return { deleted: rows.length };
}

/** Consumes the code when it matches. */
export async function consumeSecurityCode(userId: string, purpose: SecurityPurpose, code: string): Promise<boolean> {
  const clean = (code ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const rows = (await sql`select id, code_hash, attempts from public.security_codes
    where user_id = ${userId} and purpose = ${purpose} and consumed_at is null and expires_at > now()
    order by created_at desc limit 1`) as { id: string; code_hash: string; attempts: number }[];
  const row = rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;
  if ((await hashToken(`${userId}:${purpose}:${clean}`)) !== row.code_hash) {
    await sql`update public.security_codes set attempts = attempts + 1 where id = ${row.id}`;
    return false;
  }
  const done = (await sql`update public.security_codes set consumed_at = now()
    where id = ${row.id} and consumed_at is null returning id`) as unknown[];
  return done.length === 1;
}

// ---------------------------------------------------------------------------
// Password state on the Better Auth credential account
// ---------------------------------------------------------------------------

async function baIdOf(userId: string): Promise<string | null> {
  const rows = (await sql`select user_metadata->>'neon_auth_id' as ba from public.users where id = ${userId} limit 1`) as { ba: string | null }[];
  return rows[0]?.ba ?? null;
}

async function credentialHash(userId: string): Promise<{ ba: string | null; hash: string | null }> {
  const ba = await baIdOf(userId);
  if (!ba) return { ba: null, hash: null };
  const rows = (await sql`select password from neon_auth.account
    where "userId"::text = ${ba} and "providerId" = 'credential' and password is not null limit 1`) as { password: string }[];
  return { ba, hash: rows[0]?.password ?? null };
}

export async function hasPassword(userId: string): Promise<boolean> {
  return Boolean((await credentialHash(userId)).hash);
}

export async function checkPassword(userId: string, password: string): Promise<boolean> {
  const { hash } = await credentialHash(userId);
  if (!hash || !password) return false;
  const { verifyCredentialHash } = await import("@/lib/auth/credential-hash.server");
  return verifyCredentialHash({ hash, password });
}

export async function writePassword(userId: string, newPassword: string): Promise<boolean> {
  const { ba } = await credentialHash(userId);
  if (!ba) return false;
  const { hashPassword } = await import("better-auth/crypto");
  const hash = await hashPassword(newPassword);
  const updated = (await sql`update neon_auth.account set password = ${hash}, "updatedAt" = now()
    where "userId"::text = ${ba} and "providerId" = 'credential' returning id`) as unknown[];
  if (!updated.length) {
    await sql`insert into neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${crypto.randomUUID()}, ${ba}, 'credential', ${ba}, ${hash}, now(), now())`;
  }
  return true;
}

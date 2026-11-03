import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireAuth } from "@/lib/auth/middleware";

type Purpose = "merge" | "password" | "two_factor" | "delete_account" | "identity_link";
const PURPOSES: Purpose[] = ["merge", "password", "two_factor", "delete_account", "identity_link"];

/** Whether this member ever set a password (passwordless = Google/Apple/passkey only). */
export const getPasswordState = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { hasPassword } = await import("./security-code.server");
    return { hasPassword: await hasPassword(context.userId) };
  });

/** E-mails a 6-digit code to the member's own address. */
export const requestSecurityCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { purpose: Purpose }) => {
    if (!PURPOSES.includes(input?.purpose)) throw new Error("bad_purpose");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { issueSecurityCode } = await import("./security-code.server");
    return issueSecurityCode(context.userId, data.purpose, getRequest());
  });

/** Confirms a code (used before 2FA changes on passwordless accounts). */
export const confirmSecurityCode = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { purpose: Purpose; code: string }) => {
    if (!PURPOSES.includes(input?.purpose)) throw new Error("bad_purpose");
    return { purpose: input.purpose, code: String(input.code ?? "").slice(0, 12) };
  })
  .handler(async ({ data, context }) => {
    const { consumeSecurityCode } = await import("./security-code.server");
    return { ok: await consumeSecurityCode(context.userId, data.purpose, data.code) };
  });

/**
 * Set or change the password. With a password: current password OR e-mail code
 * (forgot it). Without one: e-mail code only.
 */
export const setAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { newPassword: string; currentPassword?: string; code?: string }) => {
    const pw = String(input?.newPassword ?? "");
    if (pw.length < 10 || pw.length > 128) throw new Error("weak_password");
    return { newPassword: pw, currentPassword: input.currentPassword?.slice(0, 200), code: input.code?.slice(0, 12) };
  })
  .handler(async ({ data, context }) => {
    const s = await import("./security-code.server");
    const has = await s.hasPassword(context.userId);
    let allowed = false;
    if (data.code) allowed = await s.consumeSecurityCode(context.userId, "password", data.code);
    else if (has && data.currentPassword) allowed = await s.checkPassword(context.userId, data.currentPassword);
    if (!allowed) return { ok: false as const, reason: data.code ? ("bad_code" as const) : ("bad_password" as const) };
    const ok = await s.writePassword(context.userId, data.newPassword);
    return ok ? { ok: true as const } : { ok: false as const, reason: "no_login" as const };
  });

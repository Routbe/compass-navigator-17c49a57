import { createServerFn } from "@tanstack/react-start";

/**
 * Laatste stap van de Bluesky- en Mastodon-login wanneer de provider geen
 * geverifieerd e-mailadres meestuurt:
 *   1. lid vult e-mailadres in → server mailt een 6-cijferige code;
 *   2. pas na de juiste code wordt het account aangemaakt of gekoppeld.
 * Zo kan niemand een Fediverse-account aan andermans e-mailadres hangen.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readPending() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { readCookie, readSignedValue } = await import("@/lib/app-session.server");
  const { FEDI_PENDING_COOKIE, decodePending } = await import("@/lib/fediverse-otp.server");
  const raw = await readSignedValue(readCookie(getRequestHeader("cookie") ?? "", FEDI_PENDING_COOKIE));
  return { raw, pending: decodePending(raw) };
}

/** Toont welk Fediverse-account op een e-mailadres wacht. */
export const getPendingBlueskyLogin = createServerFn({ method: "GET" }).handler(async () => {
  const { pending } = await readPending();
  return { handle: pending?.handle ?? null, provider: pending?.provider ?? null };
});

export const requestFediverseEmailCode = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (email.length > 254 || !EMAIL_REGEX.test(email)) throw new Error("Vul een geldig e-mailadres in.");
    return { email };
  })
  .handler(async ({ data }) => {
    const { raw, pending } = await readPending();
    if (!raw || !pending) throw new Error("Deze aanmelding is verlopen. Begin opnieuw.");
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    enforceRateLimit(`fedi-otp-send:${pending.provider}:${pending.accountId}`, 5, 15 * 60 * 1000);
    const { issueCode } = await import("@/lib/fediverse-otp.server");
    await issueCode(raw, data.email);
    return { ok: true as const };
  });

export const finishBlueskyLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => {
    const code = String(input?.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("De code bestaat uit 6 cijfers.");
    return { code };
  })
  .handler(async ({ data }) => {
    const { setCookie } = await import("@tanstack/react-start/server");
    const { createAppSessionValue, APP_SESSION_COOKIE, APP_SESSION_COOKIE_OPTIONS } = await import(
      "@/lib/app-session.server"
    );
    const { FEDI_PENDING_COOKIE, verifyCode } = await import("@/lib/fediverse-otp.server");

    const { raw, pending } = await readPending();
    if (!raw || !pending) throw new Error("Deze aanmelding is verlopen. Begin opnieuw.");

    // Gooit bij een foute, verlopen of geblokkeerde code — niets wordt gekoppeld.
    const email = await verifyCode(raw, data.code);

    const { findUserByEmail, createUser, updateUserMetadata } = await import("@/lib/auth/users.server");
    const metadata =
      pending.provider === "bluesky"
        ? { provider_kind: "bluesky", bluesky_did: pending.accountId, bluesky_handle: pending.handle }
        : { provider_kind: "mastodon", fediverse_handle: pending.handle };

    const existing = await findUserByEmail(email);
    // Mailbox control does not authorize attaching an unknown provider to an existing account.
    if (existing) {
      const { IDENTITY_EMAIL_CONFLICT } = await import("@/lib/identity/link-rules");
      throw new Error(IDENTITY_EMAIL_CONFLICT);
    }
    const userId = (await createUser({ email, metadata: { ...metadata, full_name: pending.handle }, emailConfirmed: true })).id;

    const { linkIdentity } = await import("@/lib/identities.server");
    const linked = await linkIdentity({
      userId,
      provider: pending.provider,
      providerAccountId: pending.accountId,
      email,
      displayName: pending.handle,
    });
    if (!linked) throw new Error("identity_already_owned");

    const { sql } = await import("@/lib/neon");
    await sql`update public.users set last_sign_in_at = now() where id = ${userId}`;

    setCookie(APP_SESSION_COOKIE, await createAppSessionValue(userId), APP_SESSION_COOKIE_OPTIONS as never);
    setCookie(FEDI_PENDING_COOKIE, "", { path: "/", maxAge: 0 } as never);
    return { ok: true as const, next: pending.next };
  });

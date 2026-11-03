import { verifyPassword as verifyLegacyPbkdf2 } from "./password.server";

/**
 * Verifies a Better Auth credential hash. Accounts migrated from the legacy
 * users password column (db/0124) keep their `pbkdf2$` hash until
 * the user next changes their password; everything else is Better Auth scrypt.
 */
export async function verifyCredentialHash({ hash, password }: { hash: string; password: string }) {
  if (!hash || !password) return false;
  if (hash.startsWith("pbkdf2$")) return verifyLegacyPbkdf2(password, hash);
  const { verifyPassword } = await import("better-auth/crypto");
  return verifyPassword({ hash, password }).catch(() => false);
}

export async function hashCredential(password: string) {
  const { hashPassword } = await import("better-auth/crypto");
  return hashPassword(password);
}

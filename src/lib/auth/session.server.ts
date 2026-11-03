import { getBridgedUser } from "@/lib/auth/bridge.server";

/**
 * Session resolution for ROUT.
 *
 * There is no extra session store: Better Auth owns sign-in,
 * sign-up and the session cookie (self-hosted Better Auth). This module only turns that session into the
 * `public.users` record the rest of the app has always worked with, so every
 * foreign key (QR codes, domains, statistics) keeps resolving unchanged.
 */

export type SessionUser = {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
  userMetadata: Record<string, unknown>;
  appMetadata: Record<string, unknown>;
  createdAt: string;
  lastSignInAt: string | null;
};

type Row = Record<string, unknown>;

export function toSessionUser(row: Row): SessionUser {
  return {
    id: row["id"] as string,
    email: row["email"] as string,
    emailConfirmedAt: (row["email_confirmed_at"] as string | null) ?? null,
    userMetadata: (row["user_metadata"] as Record<string, unknown> | null) ?? {},
    appMetadata: (row["app_metadata"] as Record<string, unknown> | null) ?? {},
    createdAt: row["created_at"] as string,
    lastSignInAt: (row["last_sign_in_at"] as string | null) ?? null,
  };
}

/**
 * The signed-in member for the in-flight request, or null when signed out.
 *
 * Better Auth is the main door. Sign-in methods it does not host —
 * today only Bluesky — leave their own signed, httpOnly cookie behind, which
 * is checked second.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const bridged = await getBridgedUser();
  if (bridged) return bridged;

  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const cookie = getRequestHeader("cookie") ?? "";
    if (!cookie) return null;
    const { readAppSessionUserId } = await import("@/lib/app-session.server");
    const userId = await readAppSessionUserId(cookie);
    if (!userId) return null;
    const { findUserById } = await import("@/lib/auth/users.server");
    const { withDbContext } = await import("@/lib/neon");
    return withDbContext({ userId, workspaceId: null }, () => findUserById(userId));
  } catch {
    return null;
  }
}

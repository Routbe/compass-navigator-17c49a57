import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { getSessionUser, type AuthUser } from "@/lib/auth.functions";
import { authClient } from "@/lib/auth-client";
import { syncSignupProfile } from "@/lib/signup-profile.functions";
import { claimReferral } from "@/lib/referral.functions";
import { clearReferrer, readReferrer } from "@/lib/referral";
import { withAuthTimeout, AUTH_GUARD_TIMEOUT_MS } from "@/lib/auth-timeout";

/**
 * Session state for ROUT's self-hosted Better Auth layer.
 *
 * The session itself lives in an httpOnly cookie that the browser cannot read,
 * so the current user is fetched from the server once on mount and refreshed
 * whenever the app asks for it. Nothing here talks to a third-party identity
 * provider — every lookup resolves against Neon in Frankfurt.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/studio/account", "/domains", "/admin"];

export type { AuthUser };

interface AuthCtx {
  user: AuthUser | null;
  /** Kept for call sites that only check for "is there a session". */
  session: { user: AuthUser } | null;
  loading: boolean;
  /** False when the database is unreachable — the app degrades instead of crashing. */
  available: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  available: true,
  refresh: async () => {},
  signOut: async () => {},
});

/** Runs the one-off post-sign-in chores; never blocks the session. */
async function flushPostSignIn(user: AuthUser | null) {
  if (!user) return;
  const meta = user.user_metadata ?? {};
  if (meta["signup_profile_applied"] !== true) {
    try {
      await syncSignupProfile({});
    } catch {
      /* best-effort: the member can still claim a handle on /claim */
    }
  }
  const referrer = readReferrer();
  if (referrer) {
    try {
      await claimReferral({ data: { referrer } });
    } catch {
      /* best-effort — never block sign-in on a referral */
    }
    clearReferrer();
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const queryClient = useQueryClient();
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const next = await withAuthTimeout(getSessionUser(), "session", AUTH_GUARD_TIMEOUT_MS);
      setUser(next);
      setAvailable(true);
      if (next) void flushPostSignIn(next);
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    // Order matters: stop in-flight requests and drop cached private data
    // before the cookie disappears, so nothing 401s or survives the back button.
    await queryClient.cancelQueries();
    queryClient.clear();
    // Local-first snapshots are private: never leave them on a shared device.
    await import("@/lib/local-first/snapshot-store").then((m) => m.clearSnapshots()).catch(() => undefined);
    try {
      await authClient.signOut();
    } catch {
      /* the cookie is cleared server-side; a network hiccup must not trap the user */
    }
    try {
      // Eigen sessiekoekje (Bluesky-aanmelding) apart wissen.
      await fetch("/api/public/session/logout", { method: "POST", credentials: "include" });
    } catch {
      /* idem: netwerkfout mag het uitloggen niet blokkeren */
    }
    setUser(null);
    await router.invalidate();
    const path = typeof window === "undefined" ? "/" : window.location.pathname;
    if (PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      void router.navigate({ to: "/auth/$authView", params: { authView: "sign-in" }, replace: true } as never);
    }
  }, [queryClient, router]);

  return (
    <Ctx.Provider
      value={{
        user,
        session: user ? { user } : null,
        loading,
        available,
        refresh,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

/** Legacy flag from the Postgres era; the Neon layer is always configured. */
export const sandboxMode = false;

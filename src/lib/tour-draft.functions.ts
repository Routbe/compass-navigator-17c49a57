import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { parseTourDraft, type TourDraft } from "@/lib/tour-draft";

/**
 * Bewaart het rondleiding-concept op e-mailadres, zodat een magic-link login op
 * een ander toestel alle stappen terugvindt. Alleen de ingelogde eigenaar
 * van dat adres kan schrijven en teruglezen.
 */
export const saveTourDraft = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { draft: unknown }) => input)
  .handler(async ({ data, context }) => {
    // Signed-in only: the draft is always stored under the session's own email.
    const email = (context.user?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false as const, reason: "invalid_email" };
    }
    const { upsertTourDraft } = await import("@/lib/tour-draft.server");
    return upsertTourDraft(email, parseTourDraft(data.draft));
  });

/** Haalt het concept van de ingelogde gebruiker op (op basis van sessie-e-mail). */
export const getMyTourDraft = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const email = (context.user?.email ?? "").trim().toLowerCase();
    if (!email) return { draft: null as TourDraft | null };
    const { readTourDraft } = await import("@/lib/tour-draft.server");
    return { draft: await readTourDraft(email) };
  });

/** Ruimt het concept op zodra het profiel echt is aangemaakt. */
export const discardMyTourDraft = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const email = (context.user?.email ?? "").trim().toLowerCase();
    if (email) {
      const { deleteTourDraft } = await import("@/lib/tour-draft.server");
      await deleteTourDraft(email);
    }
    return { ok: true as const };
  });

/**
 * Anoniem opslaan tijdens de rondleiding: er is nog geen account, dus het
 * concept hangt aan een willekeurig token dat de browser meedraagt naar de
 * registratie. Zo staat elke keuze al in Neon vóór de eerste login.
 */
export const saveTourDraftToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; draft: unknown }) => input)
  .handler(async ({ data }) => {
    const token = String(data.token ?? "").trim();
    if (token.length < 8) return { ok: false as const, reason: "invalid_token" };
    const { upsertTourDraftByToken } = await import("@/lib/tour-draft.server");
    return upsertTourDraftByToken(token, parseTourDraft(data.draft));
  });

/** Haalt een anoniem concept op na registratie (token uit de rondleiding). */
export const getTourDraftByToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const token = String(data.token ?? "").trim();
    if (token.length < 8) return { draft: null as TourDraft | null };
    const { readTourDraftByToken } = await import("@/lib/tour-draft.server");
    return { draft: await readTourDraftByToken(token) };
  });

/** Ruimt een anoniem concept op zodra het profiel echt is aangemaakt. */
export const discardTourDraftToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const token = String(data.token ?? "").trim();
    if (token.length >= 8) {
      const { deleteTourDraftByToken } = await import("@/lib/tour-draft.server");
      await deleteTourDraftByToken(token);
    }
    return { ok: true as const };
  });

/**
 * Start van elke aanmelding: legt het concept-token en de bestemming vast in
 * HttpOnly-cookies, zodat er niets in de URL hoeft. `/auth/continue` leest ze
 * na de login uit en stuurt in één 303 door.
 */
export const beginAuthIntent = createServerFn({ method: "POST" })
  .inputValidator((input: { draftToken?: string; next?: string }) => input)
  .handler(async ({ data }) => {
    const { setCookie } = await import("@tanstack/react-start/server");
    const { NEXT_COOKIE, TOUR_DRAFT_COOKIE, safeNextPath } = await import("@/lib/auth/post-auth");
    const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 };
    const token = String(data.draftToken ?? "").trim().slice(0, 80);
    if (token.length >= 8) setCookie(TOUR_DRAFT_COOKIE, token, opts);
    const next = safeNextPath(data.next ?? null);
    if (next) setCookie(NEXT_COOKIE, next, opts);
    return { ok: true as const };
  });

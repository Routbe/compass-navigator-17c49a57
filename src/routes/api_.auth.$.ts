// Guarded auth endpoint: missing provider credentials fail fast with a readable
// code instead of a generic 500 (see handleAuthRequest below).
import { createFileRoute } from "@tanstack/react-router";
import { authConfigurationReadiness, AUTH_UNAVAILABLE_TEXT } from "@/lib/auth-readiness";
import { logServerError } from "@/lib/security/safe-errors";

/**
 * ROUT's own auth endpoint (self-hosted Better Auth). Sign-up, sign-in,
 * magic links, social OAuth callbacks (`/api/auth/callback/<provider>`) and
 * sign-out all terminate here — no managed middleman.
 */

/** POST endpoints where the provider id travels in the JSON body. */
const SOCIAL_BODY_PATHS = new Set(["/sign-in/social", "/sign-in/oauth2", "/link-social", "/oauth2/link"]);
/** Callback errors that just mean "second/stale hit of the same callback". */
const STALE_CALLBACK_ERRORS = new Set(["state_mismatch", "please_restart_the_process", "invalid_code", "state_not_found"]);

/** Endpoints that need a valid ALTCHA proof in the `x-altcha` header. */
export const ALTCHA_PATHS = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/magic-link",
  "/forget-password",
  "/request-password-reset",
]);

async function checkAltcha(request: Request): Promise<Response | null> {
  const { verifyAltcha, identityNeedsHardChallenge, throttleHashForEmail } = await import("@/lib/altcha.server");
  let email: string | null = null;
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email : null;
  } catch {
    /* no JSON body */
  }
  const requireHard = email ? await identityNeedsHardChallenge(throttleHashForEmail(email)) : false;
  const result = await verifyAltcha(request.headers.get("x-altcha"), { requireHard });
  if (result.ok) return null;
  console.error(`[ALTCHA Error] rejected: ${result.reason}`);
  if (result.reason === "store_unavailable") {
    return Response.json(
      { code: "altcha_store_unavailable", message: "De beveiligingscontrole is tijdelijk niet bereikbaar. Probeer het over een minuut opnieuw." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    { code: "altcha_invalid", reason: result.reason, message: "Botcontrole mislukt. Probeer het opnieuw." },
    { status: 400, headers: { "cache-control": "no-store" } },
  );
}

/** `/callback/<provider>` (built-in) or `/oauth2/callback/<provider>` (generic). */
function providerFromPath(relativePath: string): string | null {
  const match = relativePath.match(/\/callback\/([a-z0-9-]+)$/);
  return match?.[1] ?? null;
}

async function providerFromBody(request: Request, relativePath: string): Promise<string | null> {
  if (request.method !== "POST" || !SOCIAL_BODY_PATHS.has(relativePath)) return null;
  try {
    const body = (await request.clone().json()) as { provider?: unknown; providerId?: unknown };
    const id = body.provider ?? body.providerId;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

const PROVIDER_NOT_CONFIGURED_MESSAGE =
  "Deze inlogmethode is nog niet ingesteld op de server. Gebruik e-mail of een andere inlogmethode.";

function providerNotConfigured(provider: string, missing: string[]) {
  console.warn(
    `[auth] provider "${provider}" has no credentials configured (missing: ${missing.join(", ") || "unknown"}) — refusing with provider_not_configured`,
  );
  return Response.json(
    { code: "provider_not_configured", provider, message: PROVIDER_NOT_CONFIGURED_MESSAGE },
    { status: 400, headers: { "cache-control": "no-store" } },
  );
}

/** Non-secret request facts for diagnosing cookie / state / host problems. */
function traceContext(request: Request, relativePath?: string) {
  const url = new URL(request.url);
  const cookieNames = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.split("=")[0]?.trim())
    .filter((n): n is string => typeof n === "string" && Boolean(n) && /auth|state|session/i.test(n));
  return {
    method: request.method,
    path: relativePath ?? url.pathname,
    hasCode: url.searchParams.has("code"),
    hasState: url.searchParams.has("state"),
    providerError: url.searchParams.get("error"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    betterAuthUrl: process.env["BETTER_AUTH_URL"] ?? process.env["NEXT_PUBLIC_APP_URL"] ?? null,
    authCookies: cookieNames, // names only, never values
  };
}

export async function handleAuthRequest({ request }: { request: Request }) {
  try {
    const { createRoutAuth, isProviderConfigured, missingProviderKeys, resolveAuthSecret } = await import("@/lib/better-auth.server");

    // A provider without credentials must never reach Better Auth: it would
    // throw and surface as a generic 500. Fail fast with a readable code so
    // one unconfigured provider cannot break the handler or other methods.
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const relativePath = pathname.startsWith("/api/auth")
      ? pathname.slice("/api/auth".length) || "/"
      : pathname;
    if (relativePath === "/change-email") return Response.json(
      { code: "passkey_email_change_required", message: "Wijzig je primaire e-mailadres via de beveiligde ROUT-accountpagina." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
    const provider = (await providerFromBody(request, relativePath)) ?? providerFromPath(relativePath);
    // Zero-trust admin portal: social/OAuth sign-in is refused server-side.
    const { appMode, socialLoginAllowed } = await import("@/lib/app-mode");
    if (provider && !socialLoginAllowed(appMode())) {
      return Response.json(
        { code: "social_login_disabled", message: "Sociale logins zijn uitgeschakeld op het beheerportaal." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    if (provider && !isProviderConfigured(provider)) {
      return providerNotConfigured(provider, missingProviderKeys(provider));
    }

    // Configuration failures must precede mail, database-backed challenges and
    // passkeys. Never pretend that retrying a challenge can restore configuration.
    const { hasDatabase } = await import("@/lib/neon");
    const readiness = authConfigurationReadiness(hasDatabase(), Boolean(resolveAuthSecret()));
    if (!readiness.ready) return Response.json(
      { code: readiness.code, message: AUTH_UNAVAILABLE_TEXT.nl },
      { status: 503, headers: { "cache-control": "no-store" } },
    );

    if (appMode() === "admin" && request.method === "POST" && ALTCHA_PATHS.has(relativePath)) {
      let email: unknown;
      try { email = ((await request.clone().json()) as { email?: unknown }).email; } catch { email = undefined; }
      const { adminEmailEligibility } = await import("@/lib/auth/owner-admin.server");
      const eligibility = await adminEmailEligibility(email);
      if (!eligibility.ok) {
        console.warn(`[admin-auth] refused: ${eligibility.reason}`);
        if (eligibility.reason === "db_unreachable") return Response.json(
          { code: "admin_db_unreachable", message: "De database van het beheerportaal is niet bereikbaar. Controleer DATABASE_URL in deze omgeving." },
          { status: 503, headers: { "cache-control": "no-store" } },
        );
        return Response.json(
          { code: "admin_only", message: "Dit e-mailadres is niet herkend als beheerder (OWNER_EMAILS of beheerdersrol)." },
          { status: 403, headers: { "cache-control": "no-store" } },
        );
      }
    }

    if (provider === "gitlab" && SOCIAL_BODY_PATHS.has(relativePath)) {
      const { gitlabRedirectUri } = await import("@/lib/better-auth.server");
      console.info(`[auth] gitlab redirect_uri=${gitlabRedirectUri()}`);
    }

    // No local account without the terms / privacy / 16+ confirmation.
    const { missingSignUpConsent, SIGNUP_CONSENT_HEADER } = await import("@/lib/signup-consent");
    if (missingSignUpConsent(request.method, relativePath, request.headers.get(SIGNUP_CONSENT_HEADER))) {
      return Response.json(
        { code: "consent_required", message: "Ga akkoord met de Algemene Voorwaarden en het Privacybeleid en bevestig dat je 16 jaar of ouder bent." },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    // Birth date on every local sign-up; under 16 a separate parent email (db/0174).
    let signupAge: { email: string; dob: string; parentEmail: string | null } | null = null;
    if (request.method === "POST" && relativePath === "/sign-up/email") {
      const { SIGNUP_DOB_HEADER, SIGNUP_PARENT_EMAIL_HEADER, signupAgeProblem } = await import("@/lib/minor-safety");
      const dob = request.headers.get(SIGNUP_DOB_HEADER) ?? "";
      const parentEmail = request.headers.get(SIGNUP_PARENT_EMAIL_HEADER) ?? "";
      const body = (await request.clone().json().catch(() => ({}))) as { email?: unknown };
      const email = typeof body.email === "string" ? body.email : "";
      const problem = signupAgeProblem({ dob, parentEmail, email });
      if (problem) {
        return Response.json(
          { code: problem, message: problem === "dob_invalid" ? "Vul een geldige geboortedatum in." : "Vul het e-mailadres van je ouder of voogd in (niet je eigen adres)." },
          { status: 400, headers: { "cache-control": "no-store" } },
        );
      }
      signupAge = { email, dob, parentEmail: parentEmail.trim().toLowerCase() || null };
    }

    // Self-hosted ALTCHA proof required before Better Auth runs: no user is
    // created and no mail is sent without it. Social/OAuth stay open.
    if (request.method === "POST" && ALTCHA_PATHS.has(relativePath)) {
      const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
      const { RATE_RULES, tooManyRequests } = await import("@/lib/rate-limit-rules");
      const limit = await hitRateLimit("auth", `${clientIp(request)}:${relativePath}`, RATE_RULES.authAttempt);
      if (!limit.ok) return tooManyRequests(limit.retryAfter);
      const refusal = await checkAltcha(request);
      if (refusal) return refusal;
    }

    const res = await createRoutAuth(request).handler(request);
    if (signupAge && res.ok) {
      try {
        const { recordSignupAge } = await import("@/lib/minor-safety.server");
        await recordSignupAge(signupAge.email, signupAge.dob, signupAge.parentEmail);
      } catch (e) {
        console.error("[auth] recording sign-up age failed", e instanceof Error ? e.message : e);
      }
    }
    if (relativePath === "/passkey/generate-authenticate-options" && res.ok) {
      // Ensure the browser requests biometric/PIN verification; the verified hook also checks UV.
      const options = await res.json() as Record<string, unknown>;
      return Response.json({ ...options, userVerification: "required" }, { status: res.status, headers: res.headers });
    }
    if (res.status >= 400 && !/callback/.test(relativePath)) {
      // Better Auth reports most failures as an error response, not a throw:
      // log the exact payload server-side instead of only a bare status code.
      try {
        console.error("[BetterAuth Error]:", { status: res.status, ...traceContext(request, relativePath) });
      } catch {
        /* a body-read failure must never break the response */
      }
    }
    if (/callback/.test(relativePath)) {
      // Better Auth reports state/cookie problems as a redirect with ?error=.
      const loc = res.headers.get("location") ?? "";
      const errParam = loc ? new URL(loc, request.url).searchParams.get("error") : null;
      if (res.status >= 400 || errParam) {
        // Dubbele/verlopen callback (bv. dubbelklik bij de provider): als de
        // eerste poging de sessie al aanmaakte, stil doorsturen i.p.v. foutpagina.
        // Linking errors (account taken, e-mail mismatch) must reach the
        // settings page — never be swallowed as a "duplicate callback".
        const stale = !errParam || STALE_CALLBACK_ERRORS.has(errParam);
        if (stale) try {
          const session = await createRoutAuth(request).api.getSession({ headers: request.headers });
          if (session?.user) {
            console.info("[auth] duplicate OAuth callback ignored; session already active", { error: errParam, path: relativePath });
            return new Response(null, { status: 302, headers: { location: "/auth/continue", "cache-control": "no-store" } });
          }
        } catch {
          /* fall through to the normal error */
        }
        console.error("[auth] OAuth callback rejected:", { status: res.status, error: errParam, ...traceContext(request, relativePath) });
      }
    }
    return res;
  } catch (err) {
    logServerError("auth-handler", err);
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[auth] handler failed:", {
      name: err instanceof Error ? err.name : typeof err,
      ...traceContext(request),
    });
    const code = /interactive_transactions_unsupported|runtime_role_unsafe/.test(raw)
      ? "database_safety_blocked"
      : /PROVIDER_NOT_FOUND|provider[^\n]*(not found|not configured|not enabled|unknown provider)/i.test(raw)
      ? "provider_not_configured"
      : /SECRET/.test(raw)
        ? "missing_secret"
        : /DATABASE_URL/.test(raw)
          ? "missing_database"
          : /websocket|ECONN|ENOTFOUND|ETIMEDOUT|\bconnect\b|\bpool\b/i.test(raw)
            ? "db_connect"
            : /relation|column|does not exist/i.test(raw)
              ? "db_error"
              : "auth_error";
    if (code === "provider_not_configured") {
      console.warn("[auth] provider not configured (thrown by handler)");
    }
    const message = {
      database_safety_blocked: "Inloggen is tijdelijk niet beschikbaar: de veilige databaseverbinding is nog niet gereed.",
      missing_secret: "Inloggen is niet ingesteld: BETTER_AUTH_SECRET ontbreekt op de server.",
      missing_database: "Inloggen is niet ingesteld: DATABASE_URL ontbreekt op de server.",
      db_connect: "De database is niet bereikbaar vanaf de server. Probeer later opnieuw.",
      db_error: "Inloggen faalt door een databaseprobleem (tabellen). Probeer later opnieuw.",
      auth_error: "Inloggen faalt aan serverzijde. Probeer later opnieuw.",
      provider_not_configured: PROVIDER_NOT_CONFIGURED_MESSAGE,
    }[code];
    const status = code === "provider_not_configured" ? 400 : code === "database_safety_blocked" ? 503 : 500;
    return Response.json({ code, message }, { status, headers: { "cache-control": "no-store" } });
  }
}

export const Route = createFileRoute("/api_/auth/$")({
  server: {
    handlers: {
      GET: handleAuthRequest,
      POST: handleAuthRequest,
    },
  },
});

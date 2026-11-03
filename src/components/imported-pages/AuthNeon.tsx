import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { toast } from "sonner";
import { ArrowLeft, Fingerprint, KeyRound, Loader2, Mail, MailCheck, ShieldCheck } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/PasswordField";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { POST_AUTH_PATH, SIGN_IN_PATH, AUTH_ERROR_CODES } from "@/lib/auth/post-auth";
import { beginAuthIntent } from "@/lib/tour-draft.functions";

const AUTH_ERROR_TEXT: Record<string, string> = {
  provider_rejected: "auth.error.provider_rejected",
  provider_not_configured: "auth.provider.inactive",
  session_missing: "auth.error.session_missing",
  state_mismatch: "auth.error.state_mismatch",
  link_expired: "auth.error.link_expired",
  access_denied: "auth.error.access_denied",
};
import { getEnabledProviders } from "@/lib/auth-providers.functions";
import { Altcha } from "@/components/Altcha";
import { AUTH_PROVIDERS, KEYED_PROVIDERS, FediverseDialog, ProviderMark } from "@/components/auth/ProviderKit";
import { isAdminMode } from "@/lib/app-mode";
import { usePortalFrame } from "@/components/layout/PortalContext";
import { withAltcha } from "@/lib/altcha-client";
import { OtpInput } from "@/components/otp/OtpInput";
import { redeemLoginCodeFn } from "@/lib/login-code.functions";
import { IDENTITY_EMAIL_CONFLICT } from "@/lib/identity/link-rules";
import { AUTH_UNAVAILABLE_TEXT, type AuthReadiness } from "@/lib/auth-readiness";
import { useI18n } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { SIGNUP_CONSENT_HEADER, SIGNUP_CONSENT_VERSION, canSubmitSignUp } from "@/lib/signup-consent";
import { SIGNUP_DOB_HEADER, SIGNUP_PARENT_EMAIL_HEADER, isMinorDob, signupAgeProblem } from "@/lib/minor-safety";
import { i18n as trI18n } from "@/lib/i18n";

/** Providers die via Better Auth's generic OAuth/OIDC-plugin lopen. */
const GENERIC_OAUTH = new Set(["oidc", "infomaniak"]);

/** Deliberately permissive: catches typos, never rejects a valid address. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

type Mode = "magic" | "password" | "signup";

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

/**
 * De eigen ROUT-inlogkaart ("Verder naar ROUT"), met Neon Auth eronder:
 * OAuth via `authClient.signIn.social`, e-mail via `authClient.signIn.magicLink`
 * en wachtwoord via `authClient.signIn.email` / `authClient.signUp.email`.
 */
export default function AuthNeon({ initialMode = "magic" }: { initialMode?: Mode }) {
  const { t } = useTranslation();
  const { locale } = useI18n();
  const adminPortal = Boolean(usePortalFrame()) || isAdminMode();
  const nav = useNavigate();
  const { user, refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>(adminPortal && initialMode === "signup" ? "magic" : initialMode);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpInvalid, setOtpInvalid] = useState(false);
  // Auto-submit: fires the moment the 6th digit is entered, no button.
  const submitCode = async (code: string) => {
    if (!sentTo || otpBusy) return;
    setOtpBusy(true);
    setOtpInvalid(false);
    try {
      const res = await redeemLoginCodeFn({ data: { email: sentTo, code } });
      if (res.ok) {
        window.location.assign(res.link);
        return;
      }
      setOtpInvalid(true);
      setOtp("");
      toast.error(res.reason === "rate_limited" ? t("auth.ui.code.tooMany") : t("auth.ui.code.invalid"));
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.code.invalid")));
    } finally {
      setOtpBusy(false);
    }
  };
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [needTotp, setNeedTotp] = useState(false);
  const [totp, setTotp] = useState("");
  const [fediverse, setFediverse] = useState<"bluesky" | "mastodon" | null>(null);
  const redirected = useRef(false);
  const [enabled, setEnabled] = useState<string[] | null>(null);
  const [readiness, setReadiness] = useState<AuthReadiness | null>(null);
  const unavailable = readiness?.ready === false;

  useEffect(() => {
    // Openbare route; faalt die, dan blijft `enabled` null en proberen we gewoon.
    fetch("/api/public/auth/providers", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { providers?: string[]; readiness?: AuthReadiness }) => {
        if (Array.isArray(body?.providers)) setEnabled(body.providers);
        if (body.readiness) setReadiness(body.readiness);
      })
      .catch(() =>
        getEnabledProviders()
          .then((list) => setEnabled(list))
          .catch(() => setEnabled(null)),
      );
  }, []);


  // Het volledige raster blijft altijd zichtbaar; een provider zonder sleutels
  // stuurt geen aanvraag maar toont een duidelijke melding (zie `oauth`).
  // Admin-portaal (zero-trust): geen sociale logins, alleen e-mail/magic link + passkeys.
  const visibleTiles = adminPortal ? [] : AUTH_PROVIDERS;
  const isInactive = (provider: string) =>
    KEYED_PROVIDERS.has(provider) && enabled !== null && !enabled.includes(provider);

  useEffect(() => {
    if (!user || redirected.current) return;
    redirected.current = true;
    // Server bepaalt de bestemming (concept, cookie) en stuurt in één 303 door.
    window.location.replace(POST_AUTH_PATH);
  }, [user, nav]);

  // Een mislukte Bluesky-poging komt terug met een leesbare uitleg in de URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    const legacy = params.get("bluesky_error") ?? params.get("mastodon_error");
    const redirect = params.get("redirect") ?? params.get("next");
    if (code) {
      const known = (AUTH_ERROR_CODES as readonly string[]).includes(code) ? code : "provider_rejected";
      toast.error(known === "account_not_linked" ? IDENTITY_EMAIL_CONFLICT : t(AUTH_ERROR_TEXT[known]));
    } else if (legacy) {
      toast.error(t(AUTH_ERROR_TEXT["provider_rejected"]));
    }
    // Oude ?redirect=-links: bestemming naar HttpOnly-cookie, URL opschonen.
    if (redirect) void beginAuthIntent({ data: { next: redirect } }).catch(() => null);
    if (code || legacy || redirect || params.toString()) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Altijd de canonieke origin: preview-hosts mogen nooit in een OAuth-redirect
  // belanden, anders weigert Google met `redirect_uri_mismatch`.
  // Relative: finish on the same host that received the host-only session cookie.
  const callbackURL = POST_AUTH_PATH;
  const errorCallbackURL = SIGN_IN_PATH;

  const onEmailChange = (value: string) => {
    setEmail(value);
    setEmailError(value && !EMAIL_REGEX.test(value.trim()) ? t("auth.ui.email.invalid") : null);
  };

  const emailAccepted = () => {
    if (EMAIL_REGEX.test(email.trim())) return true;
    const message = t("auth.ui.email.invalid");
    setEmailError(message);
    toast.error(message);
    return false;
  };

  /** OAuth via Neon Auth — de service stuurt door naar de provider. */
  const oauth = async (provider: string) => {
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (isInactive(provider)) {
      toast.info(t("auth.provider.inactive"));
      return;
    }
    if (connecting) return; // dubbelklik-bescherming
    setLoading(true);
    setConnecting(provider);
    let leaving = false;
    if (provider === "infomaniak") {
      const l = document.createElement("link");
      l.rel = "preconnect";
      l.href = "https://login.infomaniak.com";
      document.head.appendChild(l);
    }
    try {
      if (GENERIC_OAUTH.has(provider)) {
        const res = await fetch("/api/auth/sign-in/oauth2", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ providerId: provider, callbackURL, errorCallbackURL }),
        });
        const body = (await res.json().catch(() => null)) as { url?: string; message?: string } | null;
        if (res.ok && body?.url) {
          leaving = true;
          window.location.assign(body.url);
          return;
        }
        const name = provider.charAt(0).toUpperCase() + provider.slice(1);
        toast.error(
          body?.message ||
            (res.status >= 500
              ? t("auth.provider.server", { name })
              : t("auth.provider.config", { name })),
        );
        return;
      }
      const result = await authClient.signIn.social({ provider: provider as never, callbackURL, errorCallbackURL });
      const error = (result as { error?: { message?: string } } | undefined)?.error;
      if (error) {
        const e = error as { message?: string; code?: string; status?: number };
        const name = provider.charAt(0).toUpperCase() + provider.slice(1);
        const reason =
          e.message ||
          (e.code === "PROVIDER_NOT_FOUND" || /not found/i.test(e.code ?? "")
            ? t("auth.provider.reason")
            : e.status
              ? t("auth.provider.status", { status: e.status })
              : "");
        toast.error(reason ? `${name}: ${reason}` : t("auth.ui.toast.failed"));
      } else {
        const url = (result as { data?: { url?: string } } | undefined)?.data?.url;
        if (url) {
          leaving = true;
          window.location.assign(url);
        } else {
          console.error(`[auth] ${provider} sign-in returned no authorization URL`, result);
          toast.error(t("auth.ui.toast.failed"));
        }
      }
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.toast.failed")));
    } finally {
      // Bij doorsturen blijft de knop uit, zodat een tweede klik onmogelijk is.
      if (!leaving) {
        setLoading(false);
        setConnecting(null);
      }
    }
  };

  const verifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authClient.twoFactor.verifyTotp({ code: totp, trustDevice: true });
      if (res.error) {
        toast.error(res.error.message || t("auth.ui.code.invalid"));
        return;
      }
      setNeedTotp(false);
      if (minor) toast.success(trI18n.t("ui.13f930ec65"), { description: "We hebben je ouder of voogd een mail gestuurd om toestemming te geven." });
      else toast.success(t("auth.ui.toast.welcome"));
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const passkeyLogin = async () => {
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    setLoading(true);
    try {
      const res = await authClient.signIn.passkey();
      if (res?.error) {
        toast.error(res.error.message || t("auth.passkey.failed"));
        return;
      }
      toast.success(t("auth.ui.toast.welcome"));
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, t("auth.passkey.failed")));
    } finally {
      setLoading(false);
    }
  };

  // WebAuthn Conditional UI: saved passkeys appear in the e-mail field's autofill.
  useEffect(() => {
    if (!readiness?.ready) return;
    let cancelled = false;
    const pkc = typeof window !== "undefined" ? window.PublicKeyCredential : undefined;
    if (!pkc?.isConditionalMediationAvailable) return;
    void pkc.isConditionalMediationAvailable().then(async (ok) => {
      if (!ok || cancelled) return;
      try {
        const res = await authClient.signIn.passkey({ autoFill: true });
        if (cancelled || !res || res.error) return;
        toast.success(t("auth.ui.toast.welcome"));
        await refresh();
      } catch {
        // Aborted or dismissed autofill: the explicit passkey button still works.
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readiness?.ready]);

  /** Passwordless: Neon Auth mailt een eenmalige inloglink. */
  const continueWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (!emailAccepted()) return;
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) =>
        authClient.signIn.magicLink({ email: address, callbackURL, errorCallbackURL, fetchOptions: { headers: { "x-altcha": proof } } }),
      );
      const error = (result as { error?: { message?: string; code?: string } } | undefined)?.error;
      if (error) {
        toast.error(
          error.code === "EMAIL_SEND_FAILED"
            ? t("auth.mail.failed")
            : error.message || t("auth.ui.toast.signinFailed"),
        );
        return;
      }
      setSentTo(address);
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.toast.signinFailed")));
    } finally {
      setLoading(false);
    }
  };

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (!emailAccepted()) return;
    setLoading(true);
    try {
      const address = email.trim().toLowerCase();
      const result = await withAltcha(address, (proof) =>
        authClient.signIn.email({ email: address, password, callbackURL, fetchOptions: { headers: { "x-altcha": proof } } }),
      );
      const error = (result as { error?: { message?: string } } | undefined)?.error;
      if (error) {
        toast.error(error.message || t("auth.ui.toast.signinFailed"));
        return;
      }
      if ((result as { data?: { twoFactorRedirect?: boolean } }).data?.twoFactorRedirect) {
        setTotp("");
        setNeedTotp(true);
        return;
      }
      toast.success(t("auth.ui.toast.welcome"));
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.toast.signinFailed")));
    } finally {
      setLoading(false);
    }
  };

  const [consented, setConsented] = useState(false);
  const [dob, setDob] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const minor = isMinorDob(dob);
  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consented) { toast.error(t("auth.signupConsent.required")); return; }
    const ageProblem = signupAgeProblem({ dob, parentEmail, email });
    if (ageProblem) {
      toast.error(ageProblem === "dob_invalid" ? "Vul een geldige geboortedatum in." : ageProblem === "parent_email_same" ? "Gebruik het e-mailadres van je ouder of voogd, niet je eigen adres." : "Vul het e-mailadres van je ouder of voogd in.");
      return;
    }
    if (unavailable) { toast.error(AUTH_UNAVAILABLE_TEXT[locale]); return; }
    if (adminPortal) return;
    if (!emailAccepted()) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(t("auth.password.minimum", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    setLoading(true);
    const address = email.trim().toLowerCase();
    try {
      const result = await withAltcha(address, (proof) =>
        authClient.signUp.email({ email: address, password, name: address.split("@")[0] ?? address, callbackURL, fetchOptions: { headers: { "x-altcha": proof, [SIGNUP_CONSENT_HEADER]: SIGNUP_CONSENT_VERSION, [SIGNUP_DOB_HEADER]: dob, ...(minor ? { [SIGNUP_PARENT_EMAIL_HEADER]: parentEmail.trim().toLowerCase() } : {}) } } }),
      );
      const error = (result as { error?: { message?: string } } | undefined)?.error;
      if (error) {
        toast.error(error.message || t("auth.ui.toast.failed"));
        return;
      }
      toast.success(t("auth.ui.toast.welcome"));
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, t("auth.ui.toast.failed")));
    } finally {
      setLoading(false);
    }
  };

  const emailField = (
    <div className="space-y-1">
      <Label htmlFor="auth-email" className="text-sm">
        {t("auth.ui.email.label")}
      </Label>
      <Input
        id="auth-email"
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder={t("auth.email.placeholder")}
        autoComplete="username webauthn"
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? "auth-email-error" : undefined}
        className={`h-10 rounded-lg ${emailError ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
        required
      />
      {emailError && (
        <p id="auth-email-error" className="text-[11px] text-destructive">
          {emailError}
        </p>
      )}
      {!unavailable && <Altcha className="mt-1" />}
    </div>
  );

  return (
    <AppLayout>
      <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col items-center justify-center bg-background p-4 text-foreground">
        {!adminPortal && <div className="w-full max-w-md">
          <Link
            to="/"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("auth.ui.back")}
          </Link>
        </div>}

        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 sm:p-7">
          <div className="mb-4">
            <h1 className="mb-1 font-display text-2xl text-foreground">{adminPortal ? t("auth.admin") : t("auth.ui.title")}</h1>
            <p className="text-sm text-muted-foreground">{adminPortal ? t("auth.signin") : t("auth.ui.subtitle")}</p>
          </div>

          {unavailable && <Alert variant="destructive" className="mb-4"><AlertDescription>{AUTH_UNAVAILABLE_TEXT[locale]}</AlertDescription></Alert>}
          <Button type="button" onClick={() => void passkeyLogin()} disabled={loading || unavailable} className="cta-glow mb-1 h-auto min-h-12 w-full gap-2 whitespace-normal px-4 py-3 text-center text-sm leading-tight sm:text-base">
            <Fingerprint className="h-4 w-4 shrink-0" /> <span className="min-w-0">{t("auth.passkey")}</span>
          </Button>
          <p className="mb-3 text-center text-[11px] text-muted-foreground">{t("auth.passkey.hint")}</p>

          {!adminPortal && (
            <p data-testid="auth-implicit-consent" className="mb-2 text-center text-[11px] leading-relaxed text-muted-foreground">
              {t("auth.signupConsent.implicitBefore")}{" "}
              <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">{t("auth.signupConsent.termsShort")}</Link>{" "}
              {t("auth.signupConsent.implicitAfter")}
            </p>
          )}
          <div
            data-testid="auth-provider-tiles"
            className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-7"
          >
            {visibleTiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => {
                  if (tile.kind === "bluesky" || tile.kind === "mastodon") {
                    setFediverse(tile.kind);
                    return;
                  }
                  void oauth(tile.id);
                }}
                disabled={loading || unavailable || connecting !== null || isInactive(tile.id)}
                aria-busy={connecting === tile.id}
                aria-label={t("auth.provider.continue", { name: tile.label })}
                title={t("auth.provider.continue", { name: tile.label })}
                className="group flex h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2 transition-all hover:border-border hover:bg-muted/50 disabled:opacity-60"
              >
                {connecting === tile.id ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <ProviderMark id={tile.id} />
                )}
                <span className="sr-only">{t("auth.provider.continue", { name: tile.label })}</span>
              </button>
            ))}
          </div>

          {connecting && (
            <p role="status" aria-live="polite" className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t("auth.provider.connecting", { name: visibleTiles.find((x) => x.id === connecting)?.label ?? connecting })}
            </p>
          )}

          {needTotp && (
            <form onSubmit={verifyTotp} className="mt-3 space-y-2 rounded-xl border border-border p-3">
              <p className="text-sm">{t("auth.totp")}</p>
              <input
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label={t("auth.ui.code.label")}
                className="h-11 w-full rounded-xl border border-input bg-background text-center font-mono tracking-[0.4em]"
              />
              <button type="submit" disabled={loading || totp.length !== 6}
                className="h-11 w-full rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60">
                {t("auth.confirm")}
              </button>
            </form>
          )}

          <FediverseDialog provider={fediverse} onClose={() => setFediverse(null)} />

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("auth.ui.divider")}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {sentTo ? (
            <div
              data-testid="auth-link-sent"
              className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card/60 p-4 text-center sm:p-6"
            >
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/60">
                <MailCheck className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="font-display text-lg">{t("auth.ui.sent.title")}</h2>
              <p className="mx-auto max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                {t("auth.ui.sent.body1")}{" "}
                <strong className="font-medium text-foreground">{sentTo}</strong>
                {t("auth.ui.sent.body2")}
              </p>
              <OtpInput
                value={otp}
                onChange={(v) => {
                  setOtp(v);
                  setOtpInvalid(false);
                }}
                onComplete={submitCode}
                disabled={otpBusy}
                invalid={otpInvalid}
                ariaLabel={t("auth.ui.code.label")}
              />
              {otpBusy ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setOtp("");
                }}
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("auth.ui.other")}
              </button>
            </div>
          ) : mode === "magic" ? (
            <form onSubmit={continueWithEmail} className="space-y-3.5">
              {emailField}
              <Button
                type="submit"
                className="h-11 w-full rounded-lg font-medium"
                disabled={loading || unavailable || !!emailError}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{" "}
                    {t("auth.ui.continue.sending")}
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" aria-hidden /> {t("auth.ui.continue.cta")}
                  </>
                )}
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("auth.ui.continue.note")}
              </p>
              <button
                type="button"
                onClick={() => setMode("password")}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden /> {t("auth.ui.havePassword")}
              </button>
            </form>
          ) : mode === "password" ? (
            <form onSubmit={signInWithPassword} className="space-y-3.5">
              {emailField}
              <PasswordField value={password} onChange={setPassword} required minLength={8} />
              <Button
                type="submit"
                className="h-11 w-full rounded-lg font-medium"
                disabled={loading || unavailable || !!emailError}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.ui.password.signin")}
              </Button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMode("magic")}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden /> {t("auth.ui.password.magic")}
                </button>
                {!adminPortal && <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  {t("auth.ui.signup.cta")}
                </button>}
              </div>
            </form>
          ) : (
            <form onSubmit={signUp} className="space-y-3.5">
              {emailField}
              <PasswordField
                value={password}
                onChange={setPassword}
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
              <div className="space-y-1.5">
                <label htmlFor="auth-signup-dob" className="text-sm font-medium">Geboortedatum</label>
                <input
                  id="auth-signup-dob"
                  type="date"
                  required
                  value={dob}
                  max={new Date().toISOString().slice(0, 10)}
                  min="1900-01-01"
                  onChange={(e) => setDob(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                />
              </div>
              {minor && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                  <label htmlFor="auth-signup-parent" className="text-sm font-medium">E-mail van je ouder of voogd</label>
                  <input
                    id="auth-signup-parent"
                    type="email"
                    required
                    autoComplete="off"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">Je bent jonger dan 16. Je ouder krijgt een mail om toestemming te geven en je veiligheidsinstellingen te beheren.</p>
                </div>
              )}
              <div className="flex items-start gap-2.5 rounded-lg border border-border p-3">
                <Checkbox
                  id="auth-signup-consent"
                  checked={consented}
                  onCheckedChange={(v) => setConsented(v === true)}
                  required
                  aria-required="true"
                  className="mt-0.5"
                />
                <label htmlFor="auth-signup-consent" className="text-xs leading-relaxed text-muted-foreground">
                  {t("auth.signupConsent.before")}{" "}
                  <Link to="/terms" className="font-medium text-foreground underline underline-offset-2">{t("auth.signupConsent.terms")}</Link>{" "}
                  {t("auth.signupConsent.and")}{" "}
                  <Link to="/privacy" className="font-medium text-foreground underline underline-offset-2">{t("auth.signupConsent.privacy")}</Link>{" "}
                  {t("auth.signupConsent.after")}
                </label>
              </div>
              <Button
                type="submit"
                className="h-11 w-full rounded-lg font-medium"
                disabled={!canSubmitSignUp({ consented, busy: loading, unavailable, emailError: !!emailError })}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.ui.signup.cta")}
              </Button>
              <button
                type="button"
                onClick={() => setMode("magic")}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5" aria-hidden /> {t("auth.ui.password.magic")}
              </button>
            </form>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

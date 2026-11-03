import { useEffect, useState } from "react";
import { DocHelpLink } from "@/components/seo/DocHelpLink";
import { Link, useNavigate } from "@/lib/router-compat";
import { useSearch } from "@tanstack/react-router";
import {
  AlertTriangle,
  Download,
  Languages,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PasskeysPanel } from "@/components/settings/PasskeysPanel";
import { ConnectedAppsPanel } from "@/components/settings/ConnectedAppsPanel";
import { PasswordPanel } from "@/components/settings/PasswordPanel";
import { getPasswordState, requestSecurityCode, confirmSecurityCode } from "@/lib/account-security.functions";
import { useServerFn } from "@tanstack/react-start";
import { ConnectedAccounts } from "@/components/settings/ConnectedAccounts";
import { AvatarUpload } from "@/components/settings/AvatarUpload";
import { PhoneVerification } from "@/components/settings/PhoneVerification";
import { IdentityVerification } from "@/components/settings/IdentityVerification";
import { IdentitiesPanel } from "@/components/settings/IdentitiesPanel";
import { FreezeAccountPanel } from "@/components/settings/FreezeAccountPanel";
import { MergeAccountWizard } from "@/components/settings/MergeAccountWizard";
import { ConvertToWorkspaceWizard } from "@/components/settings/ConvertToWorkspaceWizard";
import { BunqConnectionPanel } from "@/components/dashboard/BunqConnectionPanel";
import { BillingHistoryPanel } from "@/components/dashboard/BillingHistoryPanel";
import { DataExportCard } from "@/components/dashboard/DataExportCard";
import { DeleteAccountPanel } from "@/components/settings/DeleteAccountPanel";
import { DomainClaimPanel } from "@/components/settings/DomainClaimPanel";
import { IdentityLinksPanel } from "@/components/settings/IdentityLinksPanel";
import { CustomDomainPanel } from "@/components/dashboard/CustomDomainPanel";
import { EncryptedLedgerPanel } from "@/components/settings/EncryptedLedgerPanel";
import { startPrimaryEmailChange } from "@/lib/auth/email-safety.functions";
import { withStepUp } from "@/components/auth/StepUpDialog";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db/client";
import { updateAuthUser } from "@/lib/auth.functions";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { authClient } from "@/lib/auth-client";
import { LOCALES, LOCALE_LABELS, useI18n } from "@/lib/i18n";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import { i18n as trI18n } from "@/lib/i18n";

type SettingsTab = "profile" | "security" | "identities" | "payments" | "data" | "status";

const SETTINGS_TABS: SettingsTab[] = [
  "profile",
  "security",
  "identities",
  "payments",
  "data",
  "status",
];

function parseTab(value: unknown): SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : "profile";
}

/** /settings — profile, security, linked identities and account control in four tabs. */
export default function AccountSettings() {
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const { t } = useI18n();
  const { language, save: saveLanguage } = useLanguagePreference();
  const search = useSearch({ strict: false }) as { tab?: string };
  const tab = parseTab(search.tab);

  useEffect(() => {
    document
      .querySelector('[data-sticky-tabs] [role="tab"][data-state="active"]')
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [tab]);
  const setTab = (next: SettingsTab) => {
    nav(`/studio/account?tab=${next}`, { replace: true });
  };

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [email, setEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [busyEmail, setBusyEmail] = useState(false);
  const startEmailChange = useServerFn(startPrimaryEmailChange);

  const fetchPasswordState = useServerFn(getPasswordState);
  const askSecurityCode = useServerFn(requestSecurityCode);
  const checkSecurityCode = useServerFn(confirmSecurityCode);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [mfaEmailCode, setMfaEmailCode] = useState("");
  const [mfaCodeSentTo, setMfaCodeSentTo] = useState<string | null>(null);

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaUri, setMfaUri] = useState<string | null>(null);
  const [mfaBackup, setMfaBackup] = useState<string[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav("/auth/sign-in", { replace: true });
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    setDisplayName((user.user_metadata?.display_name as string) ?? "");
    let alive = true;
    void db
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const fromProfile = (data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
        const fromOauth =
          (user.user_metadata?.avatar_url as string | undefined) ??
          (user.user_metadata?.picture as string | undefined) ??
          null;
        setAvatarUrl(fromProfile ?? fromOauth);
      });
    void authClient.getSession().then((r) => {
      if (alive) setMfaEnabled(Boolean((r.data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled));
    });
    return () => {
      alive = false;
    };
  }, [user]);

  if (loading || !user) {
    return (
      <AppLayout title="Instellingen &amp; beveiliging" crumbs={[{ label: "Instellingen" }]}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const saveProfile = async () => {
    setSavingProfile(true);
    const result = await updateAuthUser({
      data: { metadata: { display_name: displayName.trim() } },
    });
    const { error: profileError } = await db
      .from("profiles")
      .update({ display_name: displayName.trim() || null, avatar_url: avatarUrl })
      .eq("id", user.id);
    setSavingProfile(false);
    if (!result.ok) return toast.error(result.message ?? "Je profiel kon niet opgeslagen worden.");
    if (profileError) return toast.error(profileError.message);
    toast.success(trI18n.t("ui.e9983dc9ac"));
  };

  /** Credentials live in Neon Auth; send the member to the secure account area. */
  const openNeonAccount = () => nav("/account/settings");

  const changeEmail = async () => {
    setBusyEmail(true);
    try {
      await withStepUp(() => startEmailChange({ data: { email } }));
      toast.success(trI18n.t("ui.9b28393295"));
      setEmail("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Wijziging geblokkeerd."); }
    finally { setBusyEmail(false); }
  };

  const enable2fa = () => {
    setMfaUri(null);
    setMfaCode("");
    setMfaPassword("");
    setMfaBackup([]);
    setMfaEmailCode("");
    setMfaCodeSentTo(null);
    setMfaDialogOpen(true);
    void fetchPasswordState().then((r) => setHasPassword(r.hasPassword)).catch(() => setHasPassword(true));
  };

  const sendMfaEmailCode = async () => {
    const r = await askSecurityCode({ data: { purpose: "two_factor" } });
    if (r.ok) {
      setMfaCodeSentTo(r.sentTo);
      toast.success(`Code verstuurd naar ${r.sentTo}`);
    } else toast.error(r.reason === "rate_limited" ? "Te veel aanvragen. Probeer later opnieuw." : "Geen e-mailadres gevonden.");
  };

  const start2fa = async () => {
    setMfaBusy(true);
    if (hasPassword === false) {
      const ok = await checkSecurityCode({ data: { purpose: "two_factor", code: mfaEmailCode } }).then((r) => r.ok).catch(() => false);
      if (!ok) {
        setMfaBusy(false);
        return toast.error(trI18n.t("ui.2d86b15716"));
      }
    }
    const res = await authClient.twoFactor.enable({ password: mfaPassword || undefined } as never);
    setMfaBusy(false);
    if (res.error) {
      const e = res.error as { code?: string; status?: number; message?: string };
      console.error("[2fa] enable failed", e.code, e.status, e.message);
      if (e.code === "INVALID_PASSWORD") {
        return toast.error(mfaPassword
          ? "Dit wachtwoord klopt niet."
          : "Je account heeft een wachtwoord: vul het één keer in om 2FA in te stellen.");
      }
      if (e.status === 401) return toast.error(trI18n.t("ui.336089932f"));
      return toast.error(`Could not start 2FA setup${e.message ? `: ${e.message}` : "."}`);
    }
    setMfaUri(res.data.totpURI);
    setMfaBackup(res.data.backupCodes ?? []);
  };

  const verify2fa = async () => {
    setMfaBusy(true);
    const res = await authClient.twoFactor.verifyTotp({ code: mfaCode });
    setMfaBusy(false);
    if (res.error) return toast.error(res.error.message ?? "Deze code klopt niet.");
    setMfaEnabled(true);
    setMfaDialogOpen(false);
    toast.success(trI18n.t("ui.89cb23ee63"));
  };

  const disable2fa = async () => {
    const state = await fetchPasswordState().catch(() => ({ hasPassword: true }));
    let password = "";
    if (state.hasPassword) {
      const typed = window.prompt("Geef je wachtwoord om 2FA uit te zetten");
      if (typed === null) return;
      password = typed;
    } else {
      const sent = await askSecurityCode({ data: { purpose: "two_factor" } });
      if (!sent.ok) return toast.error(trI18n.t("ui.b8f81b1cc5"));
      const code = window.prompt(`We stuurden een code naar ${sent.sentTo}. Vul die in om 2FA uit te zetten.`);
      if (!code) return;
      const ok = await checkSecurityCode({ data: { purpose: "two_factor", code } }).then((r) => r.ok).catch(() => false);
      if (!ok) return toast.error(trI18n.t("ui.2d86b15716"));
    }
    const res = await authClient.twoFactor.disable({ password: password || undefined } as never);
    if (res.error) return toast.error(res.error.message ?? "2FA kon niet uitgeschakeld worden.");
    setMfaEnabled(false);
    toast.success(trI18n.t("ui.82418cec7c"));
  };

  const signOutOthers = () => openNeonAccount();

  const exportData = async () => {
    setExporting(true);
    try {
      const [{ data: saved }, { data: tracked }] = await Promise.all([
        db.from("saved_qrs").select("*"),
        db.from("tracked_qrs").select("*").eq("user_id", user.id),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        profile: {
          id: user.id,
          email: user.email,
          display_name: user.user_metadata?.display_name ?? null,
        },
        saved_qrs: saved ?? [],
        dynamic_links: tracked ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rout-account-data-${user.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(trI18n.t("ui.2e2c7e279e"));
    } catch {
      toast.error(trI18n.t("ui.fff03ac4ba"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout
      title="Instellingen &amp; beveiliging"
      description={`Signed in as ${user.email}`}
      crumbs={[{ label: "Instellingen" }]}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(parseTab(v))} className="mt-4">
        <TabsList data-sticky-tabs className="sticky-tabbar top-0 flex h-auto w-full justify-start rounded-none gap-1 overflow-x-auto whitespace-nowrap p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
          <TabsTrigger className="h-9 shrink-0 px-3" value="profile">
            {t("settings.tabs.profile")}
          </TabsTrigger>
          <TabsTrigger className="h-9 shrink-0 px-3" value="security">
            {t("settings.tabs.security")}
          </TabsTrigger>
          <TabsTrigger className="h-9 shrink-0 px-3" value="identities">
            {t("settings.tabs.identities")}
          </TabsTrigger>
          <TabsTrigger className="h-9 shrink-0 px-3" value="payments">
            Betalingen
          </TabsTrigger>
          <TabsTrigger className="h-9 shrink-0 px-3" value="data">
            Data &amp; domein
          </TabsTrigger>
          <TabsTrigger className="h-9 shrink-0 px-3" value="status">
            {t("settings.tabs.status")}
          </TabsTrigger>
        </TabsList>

        {/* Betalingen & facturen */}
        <TabsContent value="payments" className="space-y-4">
          <DocHelpLink to="/support/account/billing" />
          <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div>
              <h2 className="text-lg font-medium">Betalingen &amp; facturen</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Download je facturen als PDF. Vragen over een betaling? Mail{" "}
                <a className="underline" href="mailto:billing@rout.be">
                  billing@rout.be
                </a>{" "}
                of gebruik het{" "}
                <Link to="/contact" className="underline">
                  contactformulier
                </Link>
                .
              </p>
            </div>
            <BillingHistoryPanel />
            <div className="h-px bg-border" />
            <BunqConnectionPanel />
          </section>
        </TabsContent>

        {/* Data & domein */}
        <TabsContent value="data" className="space-y-4">
          <DocHelpLink to="/support/account/data-domains" />
          <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-lg font-medium">Data &amp; domein</h2>
            <DataExportCard />
            <div className="h-px bg-border" />
            <CustomDomainPanel />
            <div className="h-px bg-border" />
            <DomainClaimPanel />
          </section>
        </TabsContent>

        {/* Tab 1 — Profile */}
        <TabsContent value="profile" className="space-y-4">
          <DocHelpLink to="/info/profiles" />
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <UserIcon className="h-4 w-4" /> Profile
            </h2>
            <div>
              <p className="mb-1 block text-xs font-medium text-muted-foreground">
                Profielfoto
              </p>
              <AvatarUpload
                value={avatarUrl}
                name={displayName || user.email}
                onChange={setAvatarUrl}
              />
            </div>

            <div>
              <label htmlFor="account-display-name" className="mb-1 block text-xs font-medium text-muted-foreground">
                Weergavenaam
              </label>
              <Input
                id="account-display-name"
                value={displayName}
                placeholder="Jona Zeno"
                maxLength={80}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-field h-11 rounded-xl"
              />
            </div>
            <Button
              onClick={saveProfile}
              disabled={savingProfile}
              className="h-11 w-full sm:w-auto"
            >
              Profiel opslaan
            </Button>
          </section>

          <PhoneVerification />

          <IdentityVerification />


          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Languages className="h-4 w-4" /> {t("settings.language.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("settings.language.body")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {LOCALES.map((code) => {
                const active = language === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={async () => {
                      const { error } = await saveLanguage(code);
                      if (error) toast.error(error.message);
                      else toast.success(t("settings.language.saved"));
                    }}
                    aria-pressed={active}
                    className={`flex h-11 items-center justify-between rounded-xl border px-3 text-sm transition-colors ${
                      active
                        ? "border-foreground bg-muted/60 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <span>{LOCALE_LABELS[code]}</span>
                    <span className="text-xs uppercase tracking-wide">{code}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </TabsContent>

        {/* Tab 2 — Account & security */}
        <TabsContent value="security" className="space-y-4">
          <DocHelpLink to="/support/account/security" />
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Mail className="h-4 w-4" /> E-mail address
            </h2>
            <Badge
              variant="outline"
              className="w-fit gap-1.5 rounded-full px-3 py-1 text-xs font-normal"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" /> {user.email}
            </Badge>
            <Input
              value={email}
              aria-label="Nieuw primair e-mailadres"
              type="email"
              placeholder="new@email.com"
              maxLength={255}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field h-11 rounded-xl"
            />
            <Button onClick={changeEmail} disabled={busyEmail || !email} className="h-11 w-full sm:w-auto">
              E-mailadres wijzigen
            </Button>
          </section>

          <PasswordPanel />

          <PasskeysPanel />
          <ConnectedAppsPanel />

          <ConnectedAccounts />

          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <ShieldCheck className="h-4 w-4" /> Twee-staps-verificatie (2FA)
              </h2>
              <Badge
                className={
                  mfaEnabled
                    ? "bg-green-500/15 text-green-700 hover:bg-green-500/15"
                    : "bg-muted text-muted-foreground hover:bg-muted"
                }
              >
                Status: {mfaEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Add an extra layer of security to your account using an authenticator app (TOTP).
            </p>
            {mfaEnabled ? (
              <Button onClick={disable2fa} variant="outline" className="h-11 w-full sm:w-auto">
                2FA uitschakelen
              </Button>
            ) : (
              <Button onClick={enable2fa} variant="outline" className="h-11 w-full sm:w-auto">
                Enable 2FA
              </Button>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Monitor className="h-4 w-4" /> Actieve sessies
            </h2>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-sm font-medium text-foreground">
                {typeof navigator !== "undefined"
                  ? navigator.userAgent.split(") ")[0] + ")"
                  : "This device"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Huidige sessie · zojuist actief
              </p>
            </div>
            <Button onClick={signOutOthers} variant="outline" className="h-11 w-full sm:w-auto">
              Overal elders uitloggen
            </Button>
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-lg font-medium">Ontwikkelaarstoegang</h2>
            <p className="text-sm text-muted-foreground">
              Manage apps, API keys, webhooks and MCP connectors in the Developer Console.
            </p>
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <a href="/console" target="_blank" rel="noopener noreferrer">Open Developer Console</a>
            </Button>
          </section>
        </TabsContent>

        {/* Tab 3 — Linked identities */}
        <TabsContent value="identities" className="space-y-4">
          <DocHelpLink to="/support/account/linked-identities" />
          <IdentitiesPanel />
          <IdentityLinksPanel />
        </TabsContent>

        {/* Tab 4 — Account status & control */}
        <TabsContent value="status" className="space-y-4">
          <DocHelpLink to="/support/account/delete-account" />
          <EncryptedLedgerPanel />
          <FreezeAccountPanel />

          <MergeAccountWizard />

          <ConvertToWorkspaceWizard />

          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="text-lg font-medium">{t("accountData.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("accountData.body")}
            </p>
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <Link to="/my-data">{t("accountData.open")}</Link>
            </Button>
          </section>

          <section className="space-y-4 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-medium text-red-600">
              <AlertTriangle className="h-4 w-4" /> {t("accountData.dangerZone")}
            </h2>

            <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{t("accountData.downloadTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("accountData.downloadBody")}
                </p>
              </div>
              <Button
                onClick={exportData}
                disabled={exporting}
                variant="outline"
                className="gap-1.5"
              >
                <Download className="h-4 w-4" /> {t("accountData.downloadButton")}
              </Button>
            </div>

            <DeleteAccountPanel />
            <DocHelpLink to="/support/account/delete-account">{t("accountData.deleteHelp")}</DocHelpLink>
          </section>

          <Button
            variant="outline"
            className="h-11 w-full gap-2 text-destructive sm:w-auto"
            onClick={async () => {
              await signOut();
              nav("/", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </TabsContent>
      </Tabs>

      <Dialog open={mfaDialogOpen} onOpenChange={setMfaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authenticator-app instellen</DialogTitle>
            <DialogDescription>
              Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
            </DialogDescription>
          </DialogHeader>
          {!mfaUri ? (
            <div className="flex flex-col gap-3">
              {hasPassword === null ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : hasPassword ? (
                <>
                  <p className="text-sm text-muted-foreground">Bevestig met je wachtwoord.</p>
                  <Input type="password" value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)}
                    placeholder="Wachtwoord" autoComplete="current-password" className="h-11 rounded-xl" />
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Je hebt geen wachtwoord. Bevestig met een code die we naar je e-mail sturen.
                  </p>
                  <Button variant="outline" onClick={sendMfaEmailCode} className="h-11">
                    {mfaCodeSentTo ? "Nieuwe code sturen" : "Stuur code naar mijn e-mail"}
                  </Button>
                  {mfaCodeSentTo && (
                    <Input value={mfaEmailCode} onChange={(e) => setMfaEmailCode(e.target.value.replace(/\D/g, ""))}
                      maxLength={6} inputMode="numeric" autoComplete="one-time-code" placeholder="Code uit e-mail"
                      className="h-11 rounded-xl text-center tracking-widest" />
                  )}
                </>
              )}
              <Button onClick={start2fa} disabled={mfaBusy || hasPassword === null || (hasPassword ? !mfaPassword : mfaEmailCode.length !== 6)} className="h-11 w-full">
                {mfaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show QR code"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-xl bg-background p-3">
                <QRCodeSVG value={mfaUri} size={176} />
              </div>
              <p className="break-all text-center font-mono text-[11px] text-muted-foreground">
                {new URL(mfaUri).searchParams.get("secret")}
              </p>
              <Input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                maxLength={6}
                className="h-11 rounded-xl text-center tracking-widest"
              />
              <Button onClick={verify2fa} disabled={mfaBusy || mfaCode.length !== 6} className="h-11 w-full">
                Verify &amp; enable
              </Button>
              {mfaBackup.length > 0 && (
                <div className="w-full rounded-xl border border-border p-3">
                  <p className="mb-2 text-xs font-medium">Backup codes — store them somewhere safe:</p>
                  <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                    {mfaBackup.map((c) => <span key={c}>{c}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  AtSign,
  Braces,
  Building2,
  KeyRound,
  CornerDownLeft,
  Fingerprint,
  QrCode,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import { useReveal } from "@/hooks/useReveal";
import { parseOmniInput, type OmniIntent } from "@/lib/omni-parser";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useTypingPlaceholder } from "@/hooks/useTypingPlaceholder";
import { ApiVisual, GlowCard, ProfileHubVisual, WorkspaceVisual } from "@/components/gateway/BentoVisuals";

const TYPING_KEYS = ["gateway.typing.qr", "gateway.typing.handle", "gateway.typing.paste"] as const;

const ECOSYSTEM = [
  {
    Icon: KeyRound,
    key: "id",
    to: "/developer/identity-oauth",
    Visual: ProfileHubVisual,
      },
  {
    Icon: Building2,
    key: "ws",
    to: "/support/workspace/getting-started/what-is-a-workspace",
    Visual: WorkspaceVisual,
      },
  {
    Icon: Braces,
    key: "api",
    to: "/developers",
    Visual: ApiVisual,
      },
] as const;

const PRINCIPLES = [
  { Icon: Fingerprint, text: "gateway.principle.identity" },
  { Icon: QrCode, text: "gateway.principle.routing" },
  { Icon: ShieldCheck, text: "gateway.principle.privacy" },
] as const;

const SUGGESTIONS = ["https://", "@handle", "/studio", "/dashboard"] as const;

function hintFor(intent: OmniIntent, t: (k: string, v?: Record<string, string>) => string): { icon: ReactNode; text: string } {
  switch (intent.kind) {
    case "url":
      return { icon: <QrCode className="h-3.5 w-3.5" />, text: t("gateway.hint.url", { host: new URL(intent.url).host }) };
    case "handle":
      return { icon: <AtSign className="h-3.5 w-3.5" />, text: t("gateway.hint.handle", { handle: intent.handle }) };
    case "command":
      return { icon: <TerminalSquare className="h-3.5 w-3.5" />, text: t("gateway.hint.command", { command: intent.command }) };
    case "unknown":
      return { icon: <TerminalSquare className="h-3.5 w-3.5" />, text: t("gateway.hint.unknown") };
    default:
      return { icon: <CornerDownLeft className="h-3.5 w-3.5" />, text: t("gateway.hint.enter") };
  }
}

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-visible={visible ? "true" : "false"} className={cn("omni-reveal", className)}>
      {children}
    </div>
  );
}

/**
 * `/` — de Sovereign Omni-Bar. Eén invoerveld routeert alles: een URL opent de
 * QR-generator in /studio, een @handle het profiel, een commando de juiste
 * module. Ingelogde leden worden al server-side naar /dashboard gestuurd (zie
 * de route-loader); dit effect vangt enkel client-side aanmeldingen op.
 */
export default function Gateway() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const typing = useMemo(() => ["rout.be/u/jona", "rout.be/w/maximilien", ...TYPING_KEYS.map((k) => t(k))], [t]);
  const nav = useNavigate();
  const [value, setValue] = useState("");
  const intent = useMemo(() => parseOmniInput(value), [value]);
  const hint = hintFor(intent, t);
  const typed = useTypingPlaceholder(typing, value.length > 0);

  useEffect(() => {
    if (!loading && user) nav("/dashboard", { replace: true });
  }, [user, loading, nav]);

  const submit = () => {
    if (intent.kind === "url" || intent.kind === "handle" || intent.kind === "command") {
      nav(intent.destination);
    }
  };

  return (
    <AppLayout width="full" revealFooter tone="obsidian">
      <section className="omni-stage">
        <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{t("gateway.kicker")}</p>
          <h1 className="mt-5 font-display text-4xl leading-[1.05] sm:text-6xl">
            {t("gateway.title")}
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("gateway.lead")}
          </p>

          <form
            className="omni-bar mt-10 w-full"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="omni-input" className="sr-only">
              {t("gateway.inputLabel")}
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-paper-xl focus-within:border-ring">
              <TerminalSquare className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                id="omni-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={typed || t("gateway.inputPlaceholder")}
                aria-description={t("gateway.inputPlaceholder")}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="go"
                className="h-12 min-w-0 flex-1 bg-transparent font-mono text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-lg"
              />
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl"
                disabled={intent.kind === "empty" || intent.kind === "unknown"}
                aria-label={t("gateway.submit")}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 flex min-h-5 items-center justify-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              {hint.icon}
              {hint.text}
            </p>
          </form>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setValue(s === "@handle" ? "@" : s);
                  document.getElementById("omni-input")?.focus();
                }}
                className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="mt-14 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg" className="cta-glow h-12 gap-2 rounded-xl px-7 text-base">
              <Link to="/auth">
                <Fingerprint className="h-4 w-4" /> {t("gateway.claim")}
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 gap-2 rounded-xl px-7 text-base"
              onClick={() => document.getElementById("ecosystem")?.scrollIntoView({ behavior: "smooth" })}
            >
              {t("gateway.explore")} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("rout:command-palette"))}
            className="mt-6 hidden items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            {t("gateway.palette")} <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
        </div>
      </section>

      <div id="ecosystem" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-28 sm:px-6 sm:py-36">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t("gateway.eco.kicker")}</p>
          <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
            {t("gateway.eco.title")}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("gateway.eco.lead")}
          </p>
        </Reveal>

        <Reveal className="mt-20 grid gap-5 md:grid-cols-3">
          {ECOSYSTEM.map(({ Icon, key, to, Visual }) => (
            <GlowCard key={key} className="rounded-2xl border border-border bg-card">
              <div className="flex h-full flex-col p-6">
                <div className="mb-6 flex min-h-56 items-center justify-center rounded-xl border border-border/60 bg-background/60 p-4">
                  <Visual />
                </div>
                <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {t(`gateway.eco.${key}.eyebrow`)}
                </span>
                <h3 className="mt-4 font-display text-2xl text-foreground">{t(`gateway.eco.${key}.title`)}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{t(`gateway.eco.${key}.text`)}</p>
                <Link to={to} className="group mt-5 inline-flex items-center gap-1.5 text-sm text-foreground">
                  {t(`gateway.eco.${key}.cta`)} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </GlowCard>
          ))}
        </Reveal>

        <Reveal className="mt-20 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
          {PRINCIPLES.map(({ Icon, text }) => (
            <span key={text} className="inline-flex items-center gap-2">
              <Icon className="h-4 w-4 text-foreground" aria-hidden /> {t(text)}
            </span>
          ))}
        </Reveal>

        <Reveal className="mt-16 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/explore" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("gateway.link.explore")}
          </Link>
          <Link to="/product" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("gateway.link.platform")}
          </Link>
          <Link to="/developers" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("gateway.link.developers")}
          </Link>
          <Link to="/about" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("gateway.link.about")}
          </Link>
          <Link to="/auth/sign-in" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("gateway.link.signIn")}
          </Link>
        </Reveal>
      </div>
    </AppLayout>
  );
}

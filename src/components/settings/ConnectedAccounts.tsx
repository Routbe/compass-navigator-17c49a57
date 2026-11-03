import { useI18n } from "@/lib/i18n";
import { KeyRound, Mail, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Settings → Sign-in methods.
 *
 * Our own auth layer on Neon signs members in with an e-mail address plus a
 * password or a magic link. Social accounts (Mastodon, Bluesky) are connected
 * from the dashboard wizards, not here, so this panel just shows the methods
 * that are active for the current account.
 */
export function ConnectedAccounts() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const hasPassword = (user?.app_metadata?.["has_password"] as boolean | undefined) ?? true;

  const methods = [
    {
      id: "email",
      icon: <Mail className="h-4 w-4" aria-hidden />,
      label: t("auth.settings.methods.email"),
      detail: user?.email ?? "—",
      state: t("auth.settings.methods.active"),
    },
    {
      id: "password",
      icon: <KeyRound className="h-4 w-4" aria-hidden />,
      label: t("auth.settings.methods.password"),
      detail: hasPassword
        ? t("auth.settings.methods.change")
        : t("auth.settings.methods.unset"),
      state: hasPassword ? t("auth.settings.methods.active") : t("auth.settings.methods.notSet"),
    },
    {
      id: "magic",
      icon: <Sparkles className="h-4 w-4" aria-hidden />,
      label: t("auth.settings.methods.link"),
      detail: t("auth.settings.methods.linkDescription"),
      state: t("auth.settings.methods.available"),
    },
  ];

  return (
    <section className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-medium text-foreground">{t("auth.settings.methods.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("auth.settings.methods.description")}
        </p>
      </div>

      <ul className="divide-y divide-border/60">
        {methods.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 text-muted-foreground">
              {m.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-foreground">{m.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{m.detail}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{m.state}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { InfomaniakMark } from "@/components/InfomaniakMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BRAND_ICONS } from "@/utils/brandIcons";
import { BLUESKY_SUFFIXES, normalizeBlueskyHandle, withBlueskySuffix } from "@/lib/bluesky-handle";
import { filterMastodonServers } from "@/lib/mastodon-servers";
import { normalizeInstance } from "@/lib/mastodon-instance";

/** How a provider starts: Better Auth social, Better Auth generic OAuth, or our own fediverse flows. */
export type ProviderKind = "social" | "generic" | "bluesky" | "mastodon";

export interface AuthProvider {
  id: string;
  label: string;
  kind: ProviderKind;
}

/** Single source for the sign-in grid and the Linked identities list. */
export const AUTH_PROVIDERS: AuthProvider[] = [
  { id: "google", label: "Google", kind: "social" },
  { id: "github", label: "GitHub", kind: "social" },
  { id: "gitlab", label: "GitLab", kind: "social" },
  { id: "mastodon", label: "Mastodon / Fediverse", kind: "mastodon" },
  { id: "bluesky", label: "Bluesky", kind: "bluesky" },
  { id: "oidc", label: "ROUT ID", kind: "generic" },
  { id: "infomaniak", label: "Infomaniak", kind: "generic" },
];

/** Providers whose availability depends on server keys (fediverse flows need none). */
export const KEYED_PROVIDERS = new Set(["google", "github", "gitlab", "apple", "oidc", "infomaniak"]);

/** Official multi-colour Google "G" — required by Google Identity branding. */
function GoogleColorMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
      <path fill="#34A853" d="M12 24c3.24 0 6-1.08 8-2.93l-3.88-3.05c-1.08.72-2.45 1.16-4.12 1.16-3.17 0-5.85-2.14-6.81-5.02H1.18v3.15C3.15 21.23 7.27 24 12 24z" />
      <path fill="#FBBC05" d="M5.19 14.16c-.24-.72-.38-1.49-.38-2.28s.14-1.56.38-2.28V6.45H1.18C.43 7.94 0 9.91 0 12s.43 4.06 1.18 5.55l4.01-3.39z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.99 1.19 15.24 0 12 0 7.27 0 3.15 2.77 1.18 6.45l4.01 3.39c.96-2.88 3.64-5.09 6.81-5.09z" />
    </svg>
  );
}

const ICON_KEY: Record<string, string> = { oidc: "keycloak" };

export function ProviderMark({ id, className = "h-[18px] w-[18px] shrink-0" }: { id: string; className?: string }) {
  if (id === "google") return <GoogleColorMark className={className} />;
  if (id === "infomaniak") return <InfomaniakMark className={className} />;
  const icon = BRAND_ICONS[ICON_KEY[id] ?? id];
  if (!icon) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: icon.color }} aria-hidden>
      <path d={icon.path} />
    </svg>
  );
}

const chip =
  "rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground";

/**
 * Popup asking for a Bluesky handle or a Mastodon server, then starting the
 * existing flow. `link` attaches the account to the signed-in member instead
 * of signing in.
 */
export function FediverseDialog({
  provider,
  onClose,
  link = false,
  next = "/dashboard",
}: {
  provider: "bluesky" | "mastodon" | null;
  onClose: () => void;
  link?: boolean;
  next?: string;
}) {
  const [value, setValue] = useState("");
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<string[]>([]);

  useEffect(() => {
    setValue("");
    setBusy(false);
  }, [provider]);

  useEffect(() => {
    if (provider !== "mastodon") return;
    const q = value.trim();
    const timer = setTimeout(() => {
      fetch(`/api/public/mastodon/servers?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { servers: [] }))
        .then((b: { servers?: string[] }) => setRemote(b.servers ?? []))
        .catch(() => setRemote([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [provider, value]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const linkParam = link ? "&link=1" : "";
    if (provider === "bluesky") {
      const handle = normalizeBlueskyHandle(value);
      if (!handle) {
        toast.error(t("auth.fedi.blueskyError"));
        return;
      }
      setBusy(true);
      window.location.href = `/api/public/bluesky/start?handle=${encodeURIComponent(handle)}&next=${encodeURIComponent(next)}${linkParam}`;
    } else if (provider === "mastodon") {
      const instance = normalizeInstance(value);
      if (!instance) {
        toast.error(t("auth.fedi.serverError"));
        return;
      }
      setBusy(true);
      window.location.href = `/api/public/mastodon/start?instance=${encodeURIComponent(instance)}&next=${encodeURIComponent(next)}${linkParam}`;
    }
  };

  const isBluesky = provider === "bluesky";
  return (
    <Dialog open={provider !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {provider && <ProviderMark id={provider} />}
            {isBluesky ? "Bluesky" : "Mastodon / Fediverse"}
          </DialogTitle>
          <DialogDescription>
            {isBluesky ? t("auth.fedi.blueskyPrompt") : t("auth.fedi.serverPrompt")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isBluesky ? "jona.bsky.social" : "mastodon.social"}
              aria-label={isBluesky ? t("auth.fedi.handle") : t("auth.fedi.server")}
              autoComplete={isBluesky ? "username" : "off"}
              className="h-10 rounded-lg"
            />
            <Button type="submit" className="h-10 rounded-lg" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("auth.continue")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {isBluesky
              ? BLUESKY_SUFFIXES.map((suffix) => (
                  <button key={suffix} type="button" className={chip} onClick={() => setValue(withBlueskySuffix(value, suffix))}>
                    .{suffix}
                  </button>
                ))
              : filterMastodonServers(value, remote).map((host) => (
                  <button key={host} type="button" className={chip} onClick={() => setValue(host)}>
                    {host}
                  </button>
                ))}
          </div>
          {isBluesky && value && !value.includes(".") && (
            <p className="text-[11px] text-muted-foreground">
              {t("auth.fedi.preview")} <strong>{normalizeBlueskyHandle(value)}</strong>
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

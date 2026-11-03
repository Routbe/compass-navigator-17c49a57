import { useTranslation } from "react-i18next";
import { BrandLoader } from "@/components/BrandLoader";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProfileEditor, type ProfileVariant } from "@/components/dashboard/ProfileEditor";
import { BadgeCheck, Lock, Sparkles, HeartHandshake, ChevronDown, Check, CalendarClock, MessageCircleQuestion } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth } from "@/hooks/useAuth";
import { useUrlStyle } from "@/hooks/useUrlStyle";
import { styledProfilePath, urlStyleForAtPreference, urlStyleHasAt } from "@/lib/profile-url";
import { getVerificationState } from "@/lib/verification.functions";
import { getWorkspaceContext } from "@/lib/workspaces.functions";
import { verifiedTabUnlocked } from "@/lib/studio-access";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IdentityVerification } from "@/components/settings/IdentityVerification";
import { BookingStudioPanel } from "@/components/imported-pages/BookingStudio";

type PageMode = "profile" | "tip" | "booking" | "qa";

/** /studio — the dedicated Profile Hub (link-in-bio) workspace. */
export default function Studio({ initialGrid = false }: { initialGrid?: boolean } = {}) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  // Dual identity: every member has a Privacy Alias (rout.be/u/…, the default)
  // and a Verified Profile (rout.be/…, unlocked after verification). Each tab
  // edits its own, fully separate profile; ProfileEditor is keyed by variant.
  const [variant, setVariant] = useState<ProfileVariant>("alias");
  const [pageMode, setPageMode] = useState<PageMode>("profile");
  // Uitkomst van de Snapchat-koppeling (?snapchat=…) zichtbaar maken.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const snap = params.get("snapchat");
    if (!snap) return;
    const msg: Record<string, [boolean, string]> = {
      connected: [true, t("snapStatus.connected")],
      cancelled: [false, t("snapStatus.cancelled")],
      not_configured: [false, t("snapStatus.notConfigured")],
      invalid_state: [false, t("snapStatus.expired")],
      in_use: [false, t("snapStatus.inUse")],
    };
    const [ok, text] = msg[snap] ?? [false, t("snapStatus.failed")];
    void import("sonner").then(({ toast }) => (ok ? toast.success(text) : toast.error(text)));
    params.delete("snapchat");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [t]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("page") === "booking") setPageMode("booking");
  }, []);
  const [pages, setPages] = useState({ tipEnabled: false, qaEnabled: false, handle: "" });
  const updatePages = useCallback((next: { tipEnabled: boolean; qaEnabled: boolean; handle: string }) => setPages(next), []);
  const fetchState = useServerFn(getVerificationState);
  const state = useQuery({
    queryKey: ["verification-state", user?.id],
    queryFn: () => fetchState(),
    enabled: Boolean(user),
    retry: false,
  });
  const unlocked = verifiedTabUnlocked(state.data);
  const { style: urlStyle } = useUrlStyle();
  // In workspace mode Studio means the workspace's own Profile Hub, not this person's.
  const ctxFn = useServerFn(getWorkspaceContext);
  const wsCtx = useQuery({ queryKey: ["workspace-context"], queryFn: () => ctxFn(), enabled: Boolean(user), retry: false });
  const ctxData = wsCtx.data;
  const workspaceList = ctxData?.available && Array.isArray(ctxData.workspaces) ? ctxData.workspaces : [];
  const activeWorkspace = ctxData?.activeWorkspaceId
    ? workspaceList.find((w) => w && w.id === ctxData.activeWorkspaceId)
    : undefined;
  useEffect(() => {
    if (activeWorkspace) nav(`/studio/w/${encodeURIComponent(activeWorkspace.slug)}/studio`, { replace: true });
  }, [activeWorkspace, nav]);

  useEffect(() => {
    if (!loading && !user) nav("/auth/sign-in", { replace: true });
  }, [user, loading, nav]);

  const verifiedPath = (handle: string) => styledProfilePath(handle, urlStyleForAtPreference(urlStyleHasAt(urlStyle)));
  const tabs = [
    { id: "alias" as ProfileVariant, label: t("studio.profile.alias"), hint: "rout.be/u/handle", Icon: Sparkles, locked: false },
    { id: "verified" as ProfileVariant, label: t("studio.profile.verified"), hint: "rout.be/handle", Icon: BadgeCheck, locked: !unlocked },
  ];
  const tabUrl = (id: ProfileVariant) => (pages.handle ? `rout.be${id === "alias" ? `/u/${pages.handle}` : verifiedPath(pages.handle)}` : null);

  const modeIcon = (m: PageMode, Fallback: typeof Sparkles) => m === "qa" ? MessageCircleQuestion : m === "tip" ? HeartHandshake : m === "booking" ? CalendarClock : Fallback;
  const modeLabel = (m: PageMode, fallback: string) => m === "qa" ? t("studio.anonymousQuestions") : m === "tip" ? t("studio.mode.tip") : m === "booking" ? t("studio.nav.booking") : fallback;
  const modeSuffix = (m: PageMode) => m === "qa" ? "/ask" : m === "tip" ? "/tip" : m === "booking" ? "/booking" : "";

  return (
    <AppLayout
      width="wide"
      title={t("studio.page.title")}
      description={t("studio.page.description")}
      crumbs={[{ label: "Studio" }]}
      trustBadges
    >
      {loading || !user || activeWorkspace ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="relative h-24 w-24">
            <BrandLoader label={t("studio.studio.loading")} />
          </div>
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col space-y-6 pb-8">
          {/* Profile switcher: Privacy Alias and Verified Profile are two separate canvases. */}
          <div data-tour="studio-pages" role="tablist" aria-label={t("studio.mode.pages")} className="!mt-0 flex flex-nowrap gap-1 rounded-full bg-transparent p-0.5 pr-7 md:flex-wrap md:gap-2 md:p-1">
            {tabs.map(({ id, label, hint, Icon, locked }) => {
              const selected = variant === id;
              const select = () => { setVariant(id); setPageMode("profile"); };
              const trigger = <Button variant="ghost" type="button" role="tab" aria-selected={selected} aria-pressed={selected} onClick={select} className={`h-9 min-w-0 flex-1 md:h-auto md:min-h-12 justify-start gap-2 whitespace-normal rounded-lg px-3 py-2 text-left shadow-none ${selected ? "bg-foreground text-background hover:bg-foreground hover:text-background" : "bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="hidden break-all font-mono text-xs opacity-70 md:block">{selected ? tabUrl(id) ?? hint : hint}</span></span>
                {locked && <Lock className="size-3.5 shrink-0" aria-label={t("studio.common.locked")} />}
              </Button>;
              if (!selected || locked || (id !== "verified" && !pages.qaEnabled)) return <div key={id} className="flex min-w-0 flex-1">{trigger}</div>;
              return <DropdownMenu key={id}><DropdownMenuTrigger asChild><Button variant="ghost" role="tab" aria-selected aria-label={t("studio.mode.pages")} className="h-9 min-w-0 flex-1 md:h-auto md:min-h-12 justify-start gap-2 whitespace-normal rounded-lg bg-foreground px-3 py-2 text-left text-background hover:bg-foreground hover:text-background">
                {(() => { const M = modeIcon(pageMode, Icon); return <M className="size-4 shrink-0" />; })()}<span className="min-w-0 flex-1"><span className="block text-sm font-medium">{modeLabel(pageMode, label)}</span><span className="hidden break-all font-mono text-xs opacity-70 md:block">{tabUrl(id) ?? hint}{modeSuffix(pageMode)}</span></span><ChevronDown className="size-4 shrink-0" />
              </Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-24px)]">
                {(["profile", "tip", "booking", "qa"] as const).filter(mode => (mode !== "tip" || pages.tipEnabled) && (mode !== "qa" || pages.qaEnabled) && (mode !== "booking" || id === "verified")).map(mode => { const M = modeIcon(mode, BadgeCheck); return <DropdownMenuItem key={mode} onSelect={() => setPageMode(mode)}><M className="size-4" /><span className="flex-1">{modeLabel(mode, t("studio.mode.profile"))}</span>{pageMode === mode && <Check className="size-4" />}</DropdownMenuItem>; })}
              </DropdownMenuContent></DropdownMenu>;
            })}
          </div>
          <ErrorBoundary label={t("studio.page.title")} inline>
            {variant === "verified" && !unlocked ? (
              state.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("studio.common.loading")}</p>
              ) : (
                <LockedVerifiedTab />
              )
            ) : (
              <>
                {pageMode === "booking" && <BookingStudioPanel />}
                <div hidden={pageMode === "booking"}>
                  <ProfileEditor key={variant} variant={variant} initialGrid={initialGrid} pageMode={pageMode === "booking" ? "profile" : pageMode} onPagesChange={updatePages} />
                </div>
              </>
            )}
          </ErrorBoundary>
        </div>
      )}
    </AppLayout>
  );
}


function LockedVerifiedTab() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
          <Lock className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="font-display text-2xl tracking-tight">{t("studio.profile.verified")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {t("studio.profile.unlock")}
        </p>
      </div>
      <IdentityVerification />
    </div>
  );
}

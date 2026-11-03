import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCw, ShieldCheck, Smartphone, UserPlus, Wallet, ZoomIn, ZoomOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { filterGyro } from "./card-physics";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadVCard } from "@/lib/vcard";
import { getCardLiveness, getWalletCard, getWalletStatus, verifyCardLiveCode } from "@/lib/wallet/wallet.functions";
import { pickCardView } from "@/lib/wallet/card-liveness";
import type { WalletStatus } from "@/lib/wallet/wallet-pass";
import { drawCardFaces, hasWebGL, type CardFaces } from "./card-faces";
import type { CardFinish, LiveRef, TiltRef, ZoomRef } from "./RoutCard3D";

const RoutCard3D = lazy(() => import("./RoutCard3D"));

type Card = NonNullable<Awaited<ReturnType<typeof getWalletCard>>>;

/** Any WebGL crash falls back to the CSS card instead of an empty dialog. */
class GlBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** CSS 3D fallback with the exact same face images. */
function FlatCard({ faces, flipped, tilt, onFlip }: { faces: { front: string; back: string }; flipped: boolean; tilt: { x: number; y: number }; onFlip: () => void }) {
  return (
    <button type="button" onClick={onFlip} className="mx-auto block h-full max-h-[420px] [perspective:1200px]" style={{ aspectRatio: "1 / 1.588" }} aria-label="Kaart omdraaien">
      <span
        className="relative block h-full w-full transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:transition-none"
        style={{ transform: `rotateY(${(flipped ? 180 : 0) + tilt.x * 18}deg) rotateX(${-tilt.y * 12}deg)` }}
      >
        <img src={faces.front} alt="" className="absolute inset-0 h-full w-full rounded-2xl shadow-2xl [backface-visibility:hidden]" />
        <img src={faces.back} alt="" className="absolute inset-0 h-full w-full rounded-2xl shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </span>
    </button>
  );
}

function defaultFinish(fg: string): CardFinish {
  return fg === "#111111" ? "glass" : "metal";
}

/**
 * "ROUT Card": a 3D digital twin of the member's card, plus Google Wallet,
 * Apple Wallet and vCard exports — all from the same server-built payload.
 */
export function RoutCardDialog({ open, onOpenChange, handle, space }: { open: boolean; onOpenChange: (v: boolean) => void; handle: string; space?: "root" | "alias" }) {
  const { t } = useTranslation();
  const loadCard = useServerFn(getWalletCard);
  const loadStatus = useServerFn(getWalletStatus);
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [faces, setFaces] = useState<CardFaces | null>(null);
  const [images, setImages] = useState<{ front: string; back: string } | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [finish, setFinish] = useState<CardFinish>("metal");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gyro, setGyro] = useState(false);
  const tilt: TiltRef = useRef({ x: 0, y: 0, at: 0 });
  const [flatTilt, setFlatTilt] = useState({ x: 0, y: 0 });
  const live: LiveRef = useRef({ seed: [0.5, 0.5, 0.5, 0.5], expiresAt: 0, windowMs: 30_000 });
  const zoom: ZoomRef = useRef(0);
  const [zoomed, setZoomed] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verdict, setVerdict] = useState<"valid" | "invalid" | "limited" | null>(null);
  const loadLive = useServerFn(getCardLiveness);
  const verifyLive = useServerFn(verifyCardLiveCode);

  useEffect(() => {
    if (!open || card !== undefined) return;
    setWebgl(hasWebGL());
    // Privacy filter: only public card fields reach the 3D card.
    loadCard({ data: { handle, space } }).then((c) => setCard(c ? pickCardView(c) : null)).catch(() => setCard(null));
    loadStatus().then(setStatus).catch(() => setStatus({ apple: false, google: false }));
  }, [open, card, handle, space, loadCard, loadStatus]);

  useEffect(() => {
    if (!card || webgl === null) return;
    let alive = true;
    setFinish(defaultFinish(card.hexForegroundColor));
    // WebGL draws names as SDF text; the CSS fallback keeps them printed.
    void Promise.all([drawCardFaces(card, { sdfText: webgl }), drawCardFaces(card)]).then(([gl, flat]) => {
      if (!alive) return;
      setFaces(gl);
      setImages({ front: flat.front.toDataURL("image/png"), back: flat.back.toDataURL("image/png") });
    });
    if (!webgl) console.warn("[rout-card] WebGL unavailable: showing the CSS card without optical security layers.");
    return () => {
      alive = false;
    };
  }, [card, webgl]);

  // Live proof-of-now: new seed (and the owner's code) every server window.
  useEffect(() => {
    if (!open || !card) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await loadLive({ data: { handle, space } });
        if (!alive || !r) return;
        const skew = Date.now() - r.serverNow;
        live.current = { seed: r.seed, expiresAt: r.expiresAt + skew, windowMs: 30_000 };
        setCode(r.code);
        timer = setTimeout(() => void tick(), Math.max(1000, r.expiresAt + skew - Date.now() + 250));
      } catch {
        if (alive) timer = setTimeout(() => void tick(), 10_000);
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, card, handle, space, loadLive]);

  // Gyroscope tilt (after the visitor allowed motion access on iOS).
  useEffect(() => {
    if (!open || !gyro) return;
    const onTilt = (e: DeviceOrientationEvent) => {
      const prev = tilt.current;
      const dt = Math.min(0.1, (performance.now() - prev.at) / 1000 || 1 / 60);
      const x = filterGyro(prev.x, Math.max(-1, Math.min(1, (e.gamma ?? 0) / 35)), dt);
      const y = filterGyro(prev.y, Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 35)), dt);
      tilt.current = { x, y, at: performance.now() };
      setFlatTilt({ x, y });
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [open, gyro]);

  useEffect(() => {
    if (webgl === false && images) setReady(true);
  }, [webgl, images]);

  const enableGyro = async () => {
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try {
      if (D?.requestPermission && (await D.requestPermission()) !== "granted") return;
      setGyro(true);
    } catch {
      toast.error(t("card.gyroDenied"));
    }
  };

  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    tilt.current = { x, y, at: performance.now() };
    setFlatTilt({ x, y });
  }, []);

  const flip = () => {
    tilt.current = { ...tilt.current, at: performance.now() };
    setFlipped((v) => !v);
  };

  const toggleZoom = () => {
    const next = !zoomed;
    zoom.current = next ? 1 : 0;
    tilt.current = { ...tilt.current, at: performance.now() };
    setZoomed(next);
  };

  const checkCode = async () => {
    setVerdict(null);
    try {
      const r = await verifyLive({ data: { handle, space, code: verifyInput } });
      setVerdict(r.limited ? "limited" : r.valid ? "valid" : "invalid");
    } catch {
      setVerdict("invalid");
    }
  };

  const addGoogle = async () => {
    setBusy("google");
    // Open synchronously so the save page is not blocked as a popup.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch(`/api/wallet/google?username=${encodeURIComponent(handle)}${space ? `&space=${space}` : ""}`);
      const body = (await res.json()) as { saveUrl?: string; error?: string };
      if (!res.ok || !body.saveUrl) throw new Error(body.error ?? String(res.status));
      if (tab) tab.location.href = body.saveUrl;
      else window.location.href = body.saveUrl;
    } catch {
      tab?.close();
      toast.error(t("wallet.failed"));
    } finally {
      setBusy(null);
    }
  };

  const addApple = async () => {
    setBusy("apple");
    try {
      const res = await fetch(`/api/wallet/profile/${encodeURIComponent(handle)}?type=apple${space ? `&space=${space}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `rout-${handle}.pkpass`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(t("wallet.failed"));
    } finally {
      setBusy(null);
    }
  };

  const saveVcf = async () => {
    if (!card) return;
    setBusy("vcf");
    try {
      await downloadVCard({ handle: card.handle, displayName: card.displayName, tagline: card.subheader, avatarUrl: card.avatarPath, profileUrl: card.url });
    } finally {
      setBusy(null);
    }
  };

  const flat = images ? <FlatCard faces={images} flipped={flipped} tilt={flatTilt} onFlip={flip} /> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" aria-hidden /> {t("card.title")}
          </DialogTitle>
          <DialogDescription>{t("card.description")}</DialogDescription>
        </DialogHeader>

        <div
          className="relative h-[420px] w-full touch-none select-none overflow-hidden rounded-2xl bg-gradient-to-b from-muted/40 to-muted"
          onPointerMove={onPointer}
          data-scene-ready={ready ? "true" : undefined}
        >
          {card === null ? (
            <p className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">{t("card.notFound")}</p>
          ) : !faces || webgl === null ? (
            <div className="flex h-full items-center justify-center" aria-busy="true"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden /></div>
          ) : webgl ? (
            <GlBoundary fallback={<div className="flex h-full items-center p-4">{flat}</div>}>
              <Suspense fallback={<div className="flex h-full items-center p-4">{flat}</div>}>
                <RoutCard3D
                  faces={faces}
                  finish={finish}
                  flipped={flipped}
                  tilt={tilt}
                  live={live}
                  zoom={zoom}
                  onFlip={flip}
                  onReady={() => setReady(true)}
                  text={{ displayName: card!.displayName, handle: card!.handle, subheader: card!.subheader, fg: card!.hexForegroundColor, sovereignId: card!.sovereignId, code }}
                />
              </Suspense>
            </GlBoundary>
          ) : (
            <div className="flex h-full items-center p-4">{flat}</div>
          )}
          {faces && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {(["metal", "glass", "holo"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFinish(f)}
                  aria-pressed={finish === f}
                  className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur", finish === f ? "border-foreground bg-foreground text-background" : "border-border bg-background/70")}
                >
                  {t(`card.finish.${f}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={flip}><RotateCw className="h-3.5 w-3.5" aria-hidden /> {t("card.flip")}</Button>
          {webgl && faces && (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={toggleZoom} aria-pressed={zoomed}>
              {zoomed ? <ZoomOut className="h-3.5 w-3.5" aria-hidden /> : <ZoomIn className="h-3.5 w-3.5" aria-hidden />} {t("card.zoom", { defaultValue: "Loep" })}
            </Button>
          )}
          {!gyro && <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => void enableGyro()}><Smartphone className="h-3.5 w-3.5" aria-hidden /> {t("card.gyro")}</Button>}
        </div>

        {card && (
          <div className="rounded-2xl border border-border p-3">
            {code ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {t("card.liveOwner", { defaultValue: "Je live-code staat op de achterkant en wisselt elke 30 seconden. Een screenshot is dus snel ongeldig." })}
              </p>
            ) : (
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void checkCode();
                }}
              >
                <label htmlFor="rout-live-code" className="flex items-center gap-2 text-xs font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> {t("card.verifyLabel", { defaultValue: "Echtheid controleren: vraag de live-code op de achterkant" })}
                </label>
                <div className="flex gap-2">
                  <Input id="rout-live-code" value={verifyInput} onChange={(e) => { setVerifyInput(e.target.value); setVerdict(null); }} maxLength={12} autoComplete="off" spellCheck={false} placeholder="ABC 123" className="h-9 font-mono uppercase tracking-widest" />
                  <Button type="submit" size="sm" variant="outline" className="h-9" disabled={verifyInput.trim().length < 6}>{t("card.verify", { defaultValue: "Controleer" })}</Button>
                </div>
                {verdict && (
                  <p role="status" className={cn("text-xs", verdict === "valid" ? "text-primary" : "text-destructive")}>
                    {verdict === "valid"
                      ? t("card.verifyValid", { defaultValue: "Echt: deze code komt van de kaarthouder, nu." })
                      : verdict === "limited"
                        ? t("card.verifyLimited", { defaultValue: "Te veel pogingen. Probeer het over een paar minuten opnieuw." })
                        : t("card.verifyInvalid", { defaultValue: "Niet geldig of verlopen. Vraag de huidige code." })}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <Button
            type="button"
            className="h-11 gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
            disabled={!card || busy !== null || status?.google === false}
            onClick={() => void addGoogle()}
          >
            {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wallet className="h-4 w-4" aria-hidden />}
            Add to Google Wallet
          </Button>
          <Button type="button" variant="outline" className="h-11 gap-2 rounded-full" disabled={!card || busy !== null || status?.apple === false} onClick={() => void addApple()}>
            {busy === "apple" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wallet className="h-4 w-4" aria-hidden />}
            {t("wallet.apple")}
          </Button>
          <Button type="button" variant="outline" className="h-11 gap-2 rounded-full" disabled={!card || busy !== null} onClick={() => void saveVcf()}>
            <UserPlus className="h-4 w-4" aria-hidden /> {t("card.vcf")}
          </Button>
          {status && (!status.google || !status.apple) && <p className="text-center text-xs text-muted-foreground">{t("wallet.partly")}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

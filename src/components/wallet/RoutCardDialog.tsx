import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCw, Smartphone, UserPlus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadVCard } from "@/lib/vcard";
import { getWalletCard, getWalletStatus } from "@/lib/wallet/wallet.functions";
import type { WalletStatus } from "@/lib/wallet/wallet-pass";
import { drawCardFaces, hasWebGL, type CardFaces } from "./card-faces";
import type { CardFinish, TiltRef } from "./RoutCard3D";

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

  useEffect(() => {
    if (!open || card !== undefined) return;
    setWebgl(hasWebGL());
    loadCard({ data: { handle, space } }).then(setCard).catch(() => setCard(null));
    loadStatus().then(setStatus).catch(() => setStatus({ apple: false, google: false }));
  }, [open, card, handle, space, loadCard, loadStatus]);

  useEffect(() => {
    if (!card) return;
    let alive = true;
    setFinish(defaultFinish(card.hexForegroundColor));
    void drawCardFaces(card).then((f) => {
      if (!alive) return;
      setFaces(f);
      setImages({ front: f.front.toDataURL("image/png"), back: f.back.toDataURL("image/png") });
    });
    return () => {
      alive = false;
    };
  }, [card]);

  // Gyroscope tilt (after the visitor allowed motion access on iOS).
  useEffect(() => {
    if (!open || !gyro) return;
    const onTilt = (e: DeviceOrientationEvent) => {
      const x = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 35));
      const y = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 35));
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
                <RoutCard3D faces={faces} finish={finish} flipped={flipped} tilt={tilt} onFlip={flip} onReady={() => setReady(true)} />
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
          {!gyro && <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => void enableGyro()}><Smartphone className="h-3.5 w-3.5" aria-hidden /> {t("card.gyro")}</Button>}
        </div>

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

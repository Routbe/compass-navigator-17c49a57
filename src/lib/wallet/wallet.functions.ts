import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public: which wallets can issue passes right now (booleans only, never config values). */
export const getWalletStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { walletStatus } = await import("./wallet-pass");
  const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
  // An admin pause switches both wallets off; the 3D card and vCard stay available.
  if (!(await isPlatformFeatureEnabled("wallet"))) return { apple: false, google: false };
  return walletStatus(process.env as Record<string, string | undefined>);
});

/** Public: the ROUT Card payload for the 3D card (public profile data only). */
export const getWalletCard = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ handle: z.string().trim().min(1).max(100).regex(/^@?[\w.-]+$/), space: z.enum(["root", "alias"]).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { generateWalletPayload, walletOrigin } = await import("./wallet-payload.server");
    const card = await generateWalletPayload(data.handle, { space: data.space });
    if (!card) return null;
    const base = walletOrigin();
    // Same-origin path for drawing the photo on a canvas without CORS taint.
    const avatarPath = card.heroImageUrl?.startsWith(base) ? card.heroImageUrl.slice(base.length) : null;
    return { ...card, avatarPath };
  });

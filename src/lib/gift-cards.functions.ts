import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalAuth, requireAuth } from "@/lib/auth/middleware";
import { GIFT_MAX_CENTS, GIFT_MIN_CENTS } from "./gift-cards";

const purchaseSchema = z.object({
  amountCents: z.number().int().min(GIFT_MIN_CENTS).max(GIFT_MAX_CENTS),
  purchaserEmail: z.string().email(),
  purchaserName: z.string().trim().max(80).optional().nullable(),
  recipientEmail: z.string().email().optional().nullable(),
  recipientName: z.string().trim().max(80).optional().nullable(),
  message: z.string().trim().max(400).optional().nullable(),
  design: z.string().trim().max(24).optional().nullable(),
  physicalDelivery: z.boolean().optional(),
  ship: z
    .object({
      name: z.string().trim().max(80).optional().nullable(),
      line1: z.string().trim().max(140).optional().nullable(),
      postalCode: z.string().trim().max(12).optional().nullable(),
      city: z.string().trim().max(80).optional().nullable(),
      country: z.string().trim().max(2).optional().nullable(),
    })
    .optional()
    .nullable(),
  origin: z.string().url(),
});

/** Bon aanmaken en meteen naar Stripe Checkout sturen. Werkt ook zonder account. */
export const startGiftCardPurchase = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((data: unknown) => purchaseSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`gift:buy:${context.userId ?? data.purchaserEmail}`, 6, 60_000);
    const { createGiftOrder, startGiftCheckout } = await import("./gift-cards.server");
    try {
      const order = await createGiftOrder({
        ...data,
        purchaserUserId: context.userId ?? null,
      });
      const url = await startGiftCheckout({
        giftId: order.id,
        amountCents: data.amountCents,
        email: data.purchaserEmail,
        origin: data.origin,
      });
      return { ok: true as const, url, code: order.code };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "gift_order_failed";
      console.error("[gift] aankoop mislukt", reason);
      return { ok: false as const, reason };
    }
  });

/** Publieke 3D-weergave van één bon (alleen veilige velden). */
export const getPublicGiftCard = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ code: z.string().trim().min(6).max(24) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { fetchPublicGiftCard } = await import("./gift-cards.server");
    return { card: await fetchPublicGiftCard(data.code) };
  });

/** Bonnen die het ingelogde lid zelf kocht. */
export const listMyGiftCards = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { fetchMyGiftCards } = await import("./gift-cards.server");
    return { cards: await fetchMyGiftCards(context.userId) };
  });

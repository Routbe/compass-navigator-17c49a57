import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

/** Public badge catalogue — same for every visitor, no auth required. */
export const getBadgeCatalogue = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchBadgeCatalogueDb } = await import("./badges.server");
  return fetchBadgeCatalogueDb();
});

/** Public badge wall of any member — no PII, only catalogue rows + serials. */
export const getPublicUserBadges = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ userId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { fetchUserBadgesDb } = await import("./badges.server");
    return fetchUserBadgesDb(data.userId);
  });

/** Badges the signed-in member has unlocked. */
export const getMyBadges = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { fetchUserBadgesDb } = await import("./badges.server");
    return fetchUserBadgesDb(context.userId);
  });

/** The member's badge grant/revoke history, newest first. */
export const getMyBadgeActivity = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { fetchBadgeActivityDb } = await import("./badges.server");
    return fetchBadgeActivityDb(context.userId, data.limit ?? 12);
  });

import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** All linked OAuth identities plus whether a password is set. */
export const getMyIdentities = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listIdentities, hasPassword } = await import("./identities.server");
    const [identities, password] = await Promise.all([
      listIdentities(context.userId),
      hasPassword(context.userId),
    ]);
    return { identities, hasPassword: password, email: context.user?.email ?? null };
  });

/** Removes a linked identity, unless it is the very last way to sign in. */
export const unlinkMyIdentity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { identityId: string }) => {
    if (!input?.identityId) throw new Error("identity_required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { unlinkIdentity } = await import("./identities.server");
    return unlinkIdentity(context.userId, data.identityId);
  });

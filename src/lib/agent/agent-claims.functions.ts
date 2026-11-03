import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { CLAIM_TOKEN_PATTERN, hashClaimToken } from "./agent-claims";

const tokenInput = z.object({ token: z.string().regex(CLAIM_TOKEN_PATTERN, "invalid claim token") });

/** Claim-page preview. Signed-in humans only; the token hash never leaves the server. */
export const previewAgentWorkspaceClaim = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => tokenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { previewAgentClaim } = await import("./agent-workspaces.server");
    return previewAgentClaim(context.userId, await hashClaimToken(data.token));
  });

/** The merge: claimer becomes Owner, the token is destroyed, staging ends. */
export const claimAgentWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => tokenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    enforceRateLimit(`agent-claim:${context.userId}`, 10, 60_000);
    const { claimAgentWorkspace: claim } = await import("./agent-workspaces.server");
    return claim(context.userId, await hashClaimToken(data.token));
  });

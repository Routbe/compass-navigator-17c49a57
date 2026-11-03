import { sql, withDbContext } from "@/lib/neon";
import { generateClaimToken, hashClaimToken } from "./agent-claims";

/**
 * Server side of agent-provisioned workspaces. All state changes go through
 * the SECURITY DEFINER functions from migration 0164; rout_app holds only
 * EXECUTE on them and can never see a token hash.
 */

export type ProvisionedWorkspace = {
  workspaceId: string;
  slug: string;
  expiresAt: string;
  claimToken: string;
};

/** Create one unowned staging workspace for an agent. Throws the DB error text. */
export async function provisionAgentWorkspace(input: {
  userId: string;
  clientId: string;
  name: string;
  slug: string;
  description?: string;
}): Promise<ProvisionedWorkspace> {
  const claimToken = generateClaimToken((n) => crypto.getRandomValues(new Uint8Array(n)));
  const tokenHash = await hashClaimToken(claimToken);
  const rows = await withDbContext({ userId: input.userId, workspaceId: null }, async () => {
    return (await sql`
      select workspace_id, slug, expires_at
        from public.rout_agent_provision_workspace(
          ${input.clientId}, ${input.name}, ${input.slug}, ${input.description ?? null}, ${tokenHash}
        )
    `) as Array<{ workspace_id: string; slug: string; expires_at: string }>;
  });
  const row = rows[0];
  if (!row) throw new Error("provision_failed");
  return { workspaceId: row.workspace_id, slug: row.slug, expiresAt: row.expires_at, claimToken };
}

export type AgentClaimPreview = {
  name: string;
  slug: string;
  expiresAt: string;
  claimed: boolean;
  expired: boolean;
  appName: string | null;
};

/** Preview for the claim page. Signed-in humans only; never returns the hash. */
export async function previewAgentClaim(userId: string, tokenHash: string): Promise<AgentClaimPreview | null> {
  const rows = await withDbContext({ userId, workspaceId: null }, async () => {
    return (await sql`
      select name, slug, expires_at, claimed, expired, app_name
        from public.rout_agent_claim_preview(${tokenHash})
    `) as Array<{ name: string; slug: string; expires_at: string; claimed: boolean; expired: boolean; app_name: string | null }>;
  });
  const row = rows[0];
  if (!row) return null;
  return { name: row.name, slug: row.slug, expiresAt: row.expires_at, claimed: row.claimed, expired: row.expired, appName: row.app_name };
}

/** Claim: the signed-in human becomes Owner. Throws the DB error text. */
export async function claimAgentWorkspace(userId: string, tokenHash: string): Promise<{ workspaceId: string; slug: string }> {
  const rows = await withDbContext({ userId, workspaceId: null }, async () => {
    return (await sql`
      select workspace_id, slug from public.rout_claim_agent_workspace(${tokenHash})
    `) as Array<{ workspace_id: string; slug: string }>;
  });
  const row = rows[0];
  if (!row) throw new Error("claim_not_found");
  return { workspaceId: row.workspace_id, slug: row.slug };
}

/** Cron: hard delete every workspace whose claim expired unclaimed. */
export async function purgeUnclaimedAgentWorkspaces(): Promise<number> {
  const rows = (await sql`select public.rout_purge_unclaimed_agent_workspaces() as purged`) as Array<{ purged: number }>;
  return Number(rows[0]?.purged ?? 0);
}

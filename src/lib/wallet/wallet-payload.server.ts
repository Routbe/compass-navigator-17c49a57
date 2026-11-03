/**
 * generateWalletPayload: the single source of a member's ROUT Card data, used
 * by Google Wallet, Apple Wallet (.pkpass) and the in-app 3D card. Public data
 * only: the same visibility rules as the public profile pages.
 */
import { canonicalAppUrl } from "@/lib/app-url";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { sovereignIdFromDigest, walletCardPayload, type WalletCardPayload } from "./wallet-pass";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pass content always points at the configured site origin, never the request Host. */
export function walletOrigin(): string {
  const configured = process.env["WALLET_ASSET_ORIGIN"]?.trim();
  if (configured && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured)) return configured;
  return canonicalAppUrl().replace(/\/+$/, "");
}

/**
 * Card number source. Keyed per space (root/alias) with WALLET_ID_SECRET, so a
 * card number can neither be computed from a leaked account id nor link a
 * member's root and alias cards. Without the key it hashes only public data.
 */
async function cardDigest(space: "root" | "alias", accountId: string, handle: string): Promise<string> {
  const enc = new TextEncoder();
  const secret = process.env["WALLET_ID_SECRET"];
  let bytes: ArrayBuffer;
  if (secret && secret.length >= 32) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    bytes = await crypto.subtle.sign("HMAC", key, enc.encode(`rout-card:v2:${space}:${accountId}`));
  } else {
    bytes = await crypto.subtle.digest("SHA-256", enc.encode(`rout-card:public:${space}:${handle.toLowerCase()}`));
  }
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable pass serial seed: one-way from the card digest, independent of the handle. */
async function serialSeed(digest: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rout-card-serial:v1:${digest}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/**
 * Accepts a public handle. An internal account id (uuid) is only resolved when the
 * caller is server code acting for that account (`allowAccountId`); public endpoints
 * never accept it, so account ids cannot be probed or linked to cards.
 */
export async function generateWalletPayload(
  userIdOrHandle: string,
  opts: { space?: "root" | "alias"; allowAccountId?: boolean } = {},
): Promise<WalletCardPayload | null> {
  let handle = userIdOrHandle.trim().replace(/^@+/, "");
  if (!handle) return null;
  if (UUID.test(handle)) {
    if (!opts.allowAccountId) return null;
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`
      select p.username as root, a.handle as alias
        from public.users u
        left join public.profiles p on p.id = u.id and coalesce(p.verified, false) = true
        left join public.alias_profiles a on a.user_id = u.id and a.enabled = true
       where u.id = ${handle}::uuid limit 1
    `) as Record<string, unknown>[];
    const r = rows[0];
    const pick = opts.space === "alias" ? r?.["alias"] : (r?.["root"] ?? r?.["alias"]);
    if (typeof pick !== "string" || !pick) return null;
    if (opts.space === undefined && !r?.["root"]) opts = { ...opts, space: "alias" };
    handle = pick;
  }
  const { themeOf } = await import("@/lib/profile");
  const base = walletOrigin();
  const build = async (p: Record<string, unknown>, space: "root" | "alias") =>
    walletCardPayload(
      {
        handle: String(p["username"] ?? handle),
        space,
        displayName: (p["display_name"] as string | null) ?? null,
        tagline: (p["tagline"] as string | null) ?? null,
        themeBg: themeOf(String(p["theme"] ?? "")).bg,
        // Avatar paths start with the account id: the pass gets the sealed form.
        avatarSrc: profileImageSrc(await (await import("@/lib/auth/public-ref.server")).publicAvatarUrl(p["avatar_url"])),
      },
      base,
      ...(await (async () => {
        const digest = await cardDigest(space, String(p["id"] ?? ""), String(p["username"] ?? handle));
        return [sovereignIdFromDigest(digest), await serialSeed(digest)] as const;
      })()),
    );
  if (opts.space !== "alias") {
    const { readPublicProfile } = await import("@/lib/studio-profile.server");
    const root = (await readPublicProfile(handle)) as Record<string, unknown> | null;
    if (root) return build(root, "root");
    if (opts.space === "root") return null;
  }
  const { readPublicAliasProfile } = await import("@/lib/alias-profile.server");
  const alias = (await readPublicAliasProfile(handle)) as Record<string, unknown> | null;
  return alias ? build(alias, "alias") : null;
}

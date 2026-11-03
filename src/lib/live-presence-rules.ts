import { INTEGRATIONS } from "@/lib/integrations-catalog";
/** Live-status visibility: some integrations only show while (recently) in use. Browser-safe. */
const HOUR = 3600_000;

/** Providers with an activity window; others (chess, wallets, RSS) always show. */
export const LIVE_WINDOW_MS: Record<string, number> = {
  github: 24 * HOUR,
  gitlab: 24 * HOUR,
  // Fediverse: only while the newest post is less than a day old.
  mastodon: 24 * HOUR,
  bluesky: 24 * HOUR,
  wsocial: 24 * HOUR,
};

export function isLiveActive(provider: string, lastActiveAt: string | null | undefined, now = Date.now()): boolean {
  const win = LIVE_WINDOW_MS[provider];
  if (win === undefined) return true;
  if (!lastActiveAt) return false;
  const t = Date.parse(lastActiveAt);
  return Number.isFinite(t) && now - t <= win;
}

/** Spotify shows only while something is actually playing. */
export function isSpotifyVisible(np: { playing?: boolean } | null | undefined): boolean {
  return np?.playing === true;
}

/**
 * Vault providers that appear under "Live Integraties": every connectable catalog service
 * (the same list the add-component popup offers), except Spotify (presence-backed) and payments.
 */
export const LIVE_CAPABLE_PROVIDERS: string[] = INTEGRATIONS
  .filter((i) => i.mode !== "soon" && i.id !== "spotify" && i.id !== "snapchat" && i.category !== "payments")
  .map((i) => i.id);

/** Separate Snap Kit rows count once, independently of visibility or recent activity. */
export function liveConnectionCount(spotify: boolean, providers: string[], snapchat: boolean): number {
  return Number(spotify) + new Set(providers.filter((p) => LIVE_CAPABLE_PROVIDERS.includes(p))).size + Number(snapchat);
}

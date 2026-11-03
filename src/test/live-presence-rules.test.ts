import { describe, expect, it } from "vitest";
import { isLiveActive, isSpotifyVisible } from "@/lib/live-presence-rules";

const now = Date.parse("2026-10-15T12:00:00Z");
describe("live presence windows", () => {
  it("GitHub shows with activity in the last 24 hours", () => {
    expect(isLiveActive("github", "2026-10-15T00:00:00Z", now)).toBe(true);
  });
  it("GitHub hides after 24 hours without activity", () => {
    expect(isLiveActive("github", "2026-10-14T11:00:00Z", now)).toBe(false);
    expect(isLiveActive("github", null, now)).toBe(false);
  });
  it("Chess integrations are not limited", () => {
    expect(isLiveActive("lichess", null, now)).toBe(true);
  });
  it("Spotify only shows while playing", () => {
    expect(isSpotifyVisible({ playing: true })).toBe(true);
    expect(isSpotifyVisible({ playing: false })).toBe(false);
  });
});

import { LIVE_CAPABLE_PROVIDERS as LCP } from "@/lib/live-presence-rules";
describe("Live Integraties list", () => {
  it("contains GitHub and WakaTime but not Spotify (presence-backed)", () => {
    expect(LCP).toContain("github");
    expect(LCP).toContain("wakatime");
    expect(LCP).not.toContain("spotify");
  });
  it("includes YouTube and every other connectable service from the add popup", () => {
    expect(LCP).toContain("youtube");
    expect(LCP).toContain("duolingo");
    expect(LCP).not.toContain("monero");
  });
});

describe("Fediverse 24-hour window", () => {
  it.each(["mastodon", "bluesky", "wsocial"])("%s shows with a post in the last 24 hours", (p) => {
    expect(isLiveActive(p, "2026-10-15T01:00:00Z", now)).toBe(true);
  });
  it.each(["mastodon", "bluesky", "wsocial"])("%s hides when the newest post is older than 24 hours", (p) => {
    expect(isLiveActive(p, "2026-10-14T11:00:00Z", now)).toBe(false);
    expect(isLiveActive(p, null, now)).toBe(false);
  });
});

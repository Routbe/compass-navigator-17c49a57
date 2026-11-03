import { describe, expect, it } from "vitest";
import { claimsForScopes, buildAiPrompt, buildPrismaSchema, buildSqlSchema, DISCOVERY_URL } from "./integration-templates";
import { hintFor } from "./debug-hints";

const app = {
  clientId: "rout_abc",
  scopes: ["openid", "email"],
  redirectUris: ["https://x.be/cb"],
  requirePkce: true,
  richIdentityEnabled: true,
  accountDiscoveryEnabled: false,
};

describe("integration templates", () => {
  it("account discovery never enables silent login or automatic account merging", () => {
    const prompt = buildAiPrompt({ ...app, accountDiscoveryEnabled: true }, "generic", "tanstack");
    expect(prompt).not.toContain("prompt=none");
    expect(prompt).toContain("Require an authenticated local session, explicit consent and conflict checks");
    expect(prompt).toContain("never merge solely because emails match");
  });
  it("injects client id, discovery url and scopes, never a secret", () => {
    const p = buildAiPrompt(app, "cursor", "nextjs");
    expect(p).toContain("rout_abc");
    expect(p).toContain(DISCOVERY_URL);
    expect(p).toContain("openid email");
    expect(p).toContain("rout_public_activity");
    expect(p).not.toContain("is_verified_person");
    expect(p).not.toMatch(/routsec_/);
  });
  it("embeds the official bunny SVG and brand colors in every AI prompt", () => {
    for (const p of [buildAiPrompt(app, "cursor", "nextjs"), buildHandleSyncPrompt({ name: "Demo", clientId: "rout_abc" })]) {
      expect(p).toContain("## Branding & UI");
      expect(p).toContain("<svg");
      expect(p).toContain('aria-label="ROUT"');
      expect(p).toContain("#7026E1");
      expect(p).toContain("#41DB97");
    }
  });
  it("adds identity link table only with auto-discovery", () => {
    expect(buildSqlSchema(app)).not.toContain("user_identities");
    expect(buildSqlSchema({ ...app, accountDiscoveryEnabled: true })).toContain("user_identities");
    expect(buildPrismaSchema({ ...app, accountDiscoveryEnabled: true })).toContain("model UserIdentity");
  });
  it("lists claims per granted scope only", () => {
    expect(claimsForScopes(["openid", "email"])).toEqual(["sub", "email", "email_verified"]);
    expect(claimsForScopes(["openid"])).not.toContain("picture");
    expect(buildAiPrompt(app, "generic", "other")).toContain("email_verified");
  });
  it("maps errors to fixes", () => {
    expect(hintFor("missing_code_challenge")?.fix).toContain("S256");
    expect(hintFor("invalid_grant", "PKCE-controle mislukt.")?.title).toContain("PKCE");
    expect(hintFor(null)).toBeNull();
  });
});

import { buildBadgePrompt, buildHandleSyncPrompt, handleUpdatedSample } from "./integration-templates";
import { routHandleClaim } from "./handle-sync";

describe("Universal Handle Sync", () => {
  it("shares rout_handle only when enabled and profile scope granted", () => {
    expect(routHandleClaim(true, ["openid", "profile"], "anna")).toBe("anna");
    expect(routHandleClaim(false, ["openid", "profile"], "anna")).toBeUndefined();
    expect(routHandleClaim(true, ["openid", "email"], "anna")).toBeUndefined();
  });
  it("prompts contain the real client_id and never a secret", () => {
    const app = { name: "Demo", clientId: "rout_abc123" };
    for (const p of [buildHandleSyncPrompt(app), buildBadgePrompt(app), handleUpdatedSample(app.clientId)]) {
      expect(p).not.toMatch(/rcs_|client_secret=/);
    }
    expect(buildHandleSyncPrompt(app)).toContain("rout_abc123");
    expect(handleUpdatedSample(app.clientId)).toContain("rout_abc123");
  });
});

import { CLAIMS_SUPPORTED } from "./integration-templates";
describe("Handle Sync in templates", () => {
  const base = { clientId: "rout_x", scopes: ["openid", "profile"], redirectUris: [], requirePkce: true, richIdentityEnabled: false, accountDiscoveryEnabled: false };
  it("discovery advertises rout_handle", () => {
    expect(CLAIMS_SUPPORTED).toContain("rout_handle");
    expect(CLAIMS_SUPPORTED).toContain("rout_public_activity");
  });
  it("adds username + webhook only when handle sync is on", () => {
    expect(buildAiPrompt(base, "cursor", "nextjs")).not.toContain("user.handle.updated");
    expect(buildAiPrompt({ ...base, handleSyncEnabled: true }, "cursor", "nextjs")).toContain("user.handle.updated");
    expect(buildSqlSchema(base)).not.toContain("username");
    expect(buildSqlSchema({ ...base, handleSyncEnabled: true })).toContain("rout_webhook_events");
    expect(buildPrismaSchema({ ...base, handleSyncEnabled: true })).toContain("RoutWebhookEvent");
    expect(claimsForScopes(["openid", "profile"], true)).toContain("rout_handle");
    expect(claimsForScopes(["openid", "email"], true)).not.toContain("rout_handle");
  });
});

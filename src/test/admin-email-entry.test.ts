import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ admin: false, unavailable: false }));
vi.mock("@/lib/neon", () => ({ sql: vi.fn(async () => {
  if (state.unavailable) throw new Error("database unavailable");
  return state.admin ? [{ exists: 1 }] : [];
}), hasDatabase: () => true }));
vi.mock("@/lib/better-auth.server", () => ({
  createRoutAuth: vi.fn(() => ({ handler: async () => Response.json({ reachedAuth: true }) })),
  isProviderConfigured: () => false, missingProviderKeys: () => [],
  resolveAuthSecret: () => "test-secret",
}));
vi.mock("@/lib/altcha.server", () => ({ verifyAltcha: async () => ({ ok: true }), identityNeedsHardChallenge: async () => false, throttleHashForEmail: () => "hash" }));
vi.mock("@/lib/rate-limit-db.server", () => ({ hitRateLimit: async () => ({ ok: true }), clientIp: () => "test" }));
import { canUseAdminEmail } from "@/lib/auth/owner-admin.server";
import { handleAuthRequest } from "@/routes/api_.auth.$";
beforeEach(() => {
  vi.stubEnv("APP_MODE", "admin"); vi.stubEnv("OWNER_EMAILS", "owner@example.com");
  state.admin = false; state.unavailable = false;
});
afterEach(() => vi.unstubAllEnvs());
function request(path: string, email: unknown) {
  return handleAuthRequest({ request: new Request(`http://localhost/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }) });
}
describe("admin email entry", () => {
  for (const path of ["/sign-in/email", "/sign-in/magic-link", "/sign-up/email", "/forget-password", "/request-password-reset"]) {
    it(`refuses ordinary members before authentication on ${path}`, async () => {
      const res = await request(path, "member@example.com");
      expect(res.status).toBe(403); expect((await res.json()).code).toBe("admin_only");
    });
  }
  it("allows configured owners", async () => {
    expect(await canUseAdminEmail(" OWNER@example.com ")).toBe(true);
    expect((await request("/sign-in/email", "owner@example.com")).status).toBe(200);
  });
  it("allows existing administrators", async () => {
    state.admin = true;
    expect((await request("/sign-in/magic-link", "admin@example.com")).status).toBe(200);
  });
  it("does not block ordinary public sign-in", async () => {
    vi.stubEnv("APP_MODE", "public");
    expect((await request("/sign-in/email", "member@example.com")).status).toBe(200);
  });
  it("refuses missing email and database failures", async () => {
    expect(await canUseAdminEmail(undefined)).toBe(false);
    state.unavailable = true;
    expect(await canUseAdminEmail("member@example.com")).toBe(false);
  });
});
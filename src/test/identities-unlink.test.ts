import { describe, it, expect, vi } from "vitest";

const state = { fedi: [] as Record<string, unknown>[], password: false, ba: [] as Record<string, unknown>[] };
const deleted: string[] = [];
vi.mock("@/lib/neon", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("?").trim();
    if (q.startsWith("delete")) {
      deleted.push(String(values[0]));
      return Promise.resolve([]);
    }
    if (q.includes("from public.user_identities")) return Promise.resolve(state.fedi);
    if (q.includes("has_password")) return Promise.resolve([{ has_password: state.password }]);
    if (q.includes("neon_auth_id")) return Promise.resolve([{ ba: "ba-user" }]);
    if (q.includes("from neon_auth.account")) return Promise.resolve(state.ba);
    return Promise.resolve([]);
  },
}));
const { unlinkIdentity } = await import("@/lib/identities.server");

describe("unlinkIdentity", () => {
  it("refuses removing the last sign-in method", async () => {
    state.fedi = [{ id: "f1", provider: "bluesky", provider_account_id: "did:x", created_at: "" }];
    expect(await unlinkIdentity("u1", "f1")).toEqual({ ok: false, reason: "last_method" });
  });
  it("allows it when a Better Auth social account remains", async () => {
    state.ba = [{ id: "a1", providerId: "github", accountId: "1", createdAt: "" }];
    expect(await unlinkIdentity("u1", "f1")).toEqual({ ok: true });
  });
  it("counts a Better Auth password as a sign-in method", async () => {
    state.fedi = [];
    state.ba = [
      { id: "a1", providerId: "github", accountId: "1", createdAt: "" },
      { id: "c1", providerId: "credential", accountId: "u", createdAt: "" },
    ];
    expect(await unlinkIdentity("u1", "ba:a1")).toEqual({ ok: true });
    expect(deleted).toContain("a1");
  });
});

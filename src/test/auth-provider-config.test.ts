import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAuthRequest } from "@/routes/api_.auth.$";

/**
 * A social provider without CLIENT_ID/CLIENT_SECRET must fail with a readable
 * `provider_not_configured` (400) — never a generic 500 — and must not block
 * other sign-in methods. The guard runs before Better Auth is ever created.
 */

const PROVIDER_ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITLAB_CLIENT_ID",
  "GITLAB_CLIENT_SECRET",
  "APPLE_CLIENT_ID",
  "APPLE_CLIENT_SECRET",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_DISCOVERY_URL",
  "INFOMANIAK_CLIENT_ID",
  "INFOMANIAK_CLIENT_SECRET",
  // Cleared too so the "not blocked" cases fail deterministically on config
  // instead of trying to reach a real database.
  "DATABASE_URL",
  "NEON_API_KEY",
  "LOVABLE_API_KEY",
  "BETTER_AUTH_SECRET",
  "SESSION_SECRET",
];

function clearEnv() {
  for (const key of PROVIDER_ENV_KEYS) vi.stubEnv(key, "");
}

function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(request: Request) {
  return handleAuthRequest({ request });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("auth handler with missing OAuth credentials", () => {
  it("reports missing account database before requesting an email security proof", async () => {
    clearEnv();
    const res = await call(post("/api/auth/sign-in/magic-link", { email: "someone@example.com" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "missing_database" });
  }, 30_000);
  it("refuses social sign-in with provider_not_configured (400) and warns with the provider name", async () => {
    clearEnv();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await call(post("/api/auth/sign-in/social", { provider: "github", callbackURL: "/dashboard" }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; provider: string; message: string };
    expect(body.code).toBe("provider_not_configured");
    expect(body.provider).toBe("github");
    expect(body.message).toMatch(/niet ingesteld/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"github"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("GITHUB_CLIENT_ID"));
    // First request in this file pays the cold module-load cost; under a full
    // suite run that can exceed the default 5s timeout.
  }, 30_000);

  it("refuses generic OAuth (providerId) and OAuth callbacks the same way", async () => {
    clearEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const generic = await call(post("/api/auth/sign-in/oauth2", { providerId: "infomaniak", callbackURL: "/dashboard" }));
    expect(generic.status).toBe(400);
    expect(((await generic.json()) as { code: string }).code).toBe("provider_not_configured");

    const callback = await call(new Request("http://localhost/api/auth/callback/google"));
    expect(callback.status).toBe(400);
    expect(((await callback.json()) as { code: string }).code).toBe("provider_not_configured");
  });

  it("does not block magic link when social providers are unconfigured", async () => {
    clearEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(post("/api/auth/sign-in/magic-link", { email: "someone@example.com" }));

    const body = (await res.json()) as { code: string };
    expect(body.code).not.toBe("provider_not_configured");
  });

  it("lets a fully configured provider through the guard", async () => {
    clearEnv();
    vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "test-client-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(post("/api/auth/sign-in/social", { provider: "github", callbackURL: "/dashboard" }));

    const body = (await res.json()) as { code: string };
    expect(body.code).not.toBe("provider_not_configured");
  });
});

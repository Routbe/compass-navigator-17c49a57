import { createFileRoute } from "@tanstack/react-router";

/** OpenID Connect RP-Initiated Logout 1.0. */
async function hintAudience(hint: string | null): Promise<string | null> {
  if (!hint) return null;
  const parts = hint.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const fromB64 = (v: string) => Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  try {
    const header = JSON.parse(new TextDecoder().decode(fromB64(h))) as { alg?: unknown; kid?: unknown };
    const { verificationKey } = await import("@/lib/oauth/keys.server");
    const key = await verificationKey(header);
    if (!key) return null;
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64(s) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`) as BufferSource);
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64(p))) as Record<string, unknown>;
    const { issuer } = await import("@/lib/oauth/provider.server");
    // Expired hints are allowed by the spec; issuer and audience are not negotiable.
    if (payload["iss"] !== issuer() || typeof payload["aud"] !== "string") return null;
    return payload["aud"];
  } catch {
    return null;
  }
}

async function handle(request: Request, params: URLSearchParams): Promise<Response> {
  const { decideEndSessionRedirect } = await import("@/lib/oauth/end-session-rules");
  const { getClientByClientId } = await import("@/lib/oauth/provider.server");
  const { APP_SESSION_COOKIE } = await import("@/lib/app-session.server");
  const aud = await hintAudience(params.get("id_token_hint"));
  const client = aud ? await getClientByClientId(aud) : null;
  const decision = decideEndSessionRedirect({
    requested: params.get("post_logout_redirect_uri"),
    state: params.get("state"),
    hintAud: aud,
    clientId: params.get("client_id"),
    registered: client ? client.postLogoutRedirectUris : null,
  });
  const headers = new Headers({ "Cache-Control": "no-store" });
  try {
    const { createRoutAuth } = await import("@/lib/better-auth.server");
    const res = await createRoutAuth(request).api.signOut({ headers: request.headers, asResponse: true });
    for (const c of res.headers.getSetCookie?.() ?? []) headers.append("Set-Cookie", c);
  } catch {
    // No Better Auth session: clearing the ROUT cookie below is still enough.
  }
  headers.append("Set-Cookie", `${APP_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  headers.set("Location", decision.kind === "redirect" ? decision.target : "/");
  return new Response(null, { status: 302, headers });
}

export const Route = createFileRoute("/oauth/end-session")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request, new URL(request.url).searchParams),
      POST: async ({ request }) => handle(request, new URLSearchParams(await request.text())),
    },
  },
});

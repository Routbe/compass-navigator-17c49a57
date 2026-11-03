/** Pure generators for AI prompts and database schema templates (Developer Console). */
import { BRAND, LOGO_INNER, LOGO_VIEWBOX } from "@/lib/brand/logo";
import { routButtonSnippet } from "./button-kit";

export const ROUT_ISSUER = "https://rout.be";
export const DISCOVERY_URL = `${ROUT_ISSUER}/.well-known/openid-configuration`;

/**
 * The official ROUT bunny as ready-to-paste inline SVG for AI coders.
 * Source of truth is `src/lib/brand/logo.ts` — never draw another rabbit.
 */
export const ROUT_BUNNY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}" fill="currentColor" role="img" aria-label="ROUT" width="20" height="25"><g fill="${BRAND.ink}">${LOGO_INNER}</g></svg>`;

/** Branding & UI section shared by every generated AI prompt. */
function brandingSection(): string[] {
  return [
    "",
    "## Branding & UI (strict)",
    `- The "Login with ROUT" button MUST show the official ROUT bunny logo. Use this exact inline SVG, unmodified (you may only change width/height proportionally and the fill color):`,
    "",
    "```html",
    ROUT_BUNNY_SVG,
    "```",
    "",
    `- Brand colors: ROUT purple ${BRAND.purple}, mint ${BRAND.mint}, ink ${BRAND.ink}, paper ${BRAND.paper}.`,
    "- Use the canonical button markup below; adapt labels to the app language, preserve the official logo and accessible focus state. Connect ROUT links an already authenticated local account; it must not create or replace the local session.",
    routButtonSnippet("login"),
    routButtonSnippet("connect"),
    "- Never redraw, stretch, rotate or recolor the bunny beyond the allowed fill change; never replace it with another icon or animal.",
  ];
}

export type AppType = "web" | "spa" | "native";
export type AiTool = "cursor" | "copilot" | "lovable" | "generic";
export type Stack = "nextjs" | "tanstack" | "express" | "other";

export type TemplateApp = {
  clientId: string;
  scopes: string[];
  redirectUris: string[];
  requirePkce: boolean;
  richIdentityEnabled: boolean;
  accountDiscoveryEnabled: boolean;
  /** Universal Handle Sync: `rout_handle` claim + `user.handle.updated` webhook. */
  handleSyncEnabled?: boolean;
};

const STACKS: Record<Stack, string> = {
  nextjs: "Next.js (App Router, route handlers)",
  tanstack: "TanStack Start (createServerFn + server routes)",
  express: "Node.js / Express",
  other: "my current stack",
};

const TOOLS: Record<AiTool, string> = {
  cursor: "You are working inside Cursor on my codebase.",
  copilot: "You are GitHub Copilot Chat working in my repository.",
  lovable: "You are Lovable, building my app.",
  generic: "You are an expert full-stack engineer.",
};

/** Claims returned per scope (mirrors identityClaims in provider.server.ts). */
export const SCOPE_CLAIMS: Record<string, string[]> = {
  openid: ["sub"],
  profile: ["preferred_username", "name", "picture"],
  email: ["email", "email_verified"],
  linked_accounts: ["linked_accounts[].provider", "linked_accounts[].account_id"],
};

/** Every claim ROUT can ever send (advertised as `claims_supported` in discovery). */
export const CLAIMS_SUPPORTED = [
  "sub", "iss", "aud", "exp", "iat", "nonce", "acr",
  "preferred_username", "name", "picture", "email", "email_verified",
  "linked_accounts", "rout_handle", "rout_public_activity",
] as const;

export function claimsForScopes(scopes: string[], handleSync = false): string[] {
  const out = new Set<string>(["sub"]);
  for (const s of scopes) for (const c of SCOPE_CLAIMS[s] ?? []) out.add(c);
  if (handleSync && scopes.includes("profile")) out.add("rout_handle");
  return [...out];
}

export function buildAiPrompt(app: TemplateApp, tool: AiTool, stack: Stack): string {
  const scopes = app.scopes.join(" ");
  const redirect = app.redirectUris[0];
  const lines = [
    TOOLS[tool],
    `Implement "Login with ROUT" (OpenID Connect) in ${STACKS[stack]}.`,
    "",
    "## Configuration",
    `- Discovery URL: ${DISCOVERY_URL}`,
    `- client_id: ${app.clientId}`,
    "- Confidential server client: read client_secret from ROUT_CLIENT_SECRET on the server. Public SPA/native client: use PKCE without a secret; never invent or embed one.",
    `- Scopes: ${scopes}`,
    `- Redirect URI: ${redirect ?? "NOT CONFIGURED — request the exact registered URI before enabling authorization."}`,
    `- PKCE: ${app.requirePkce ? "REQUIRED (S256)" : "recommended (S256)"}`,
    `- Claims you will receive (userinfo / id_token): ${claimsForScopes(app.scopes, app.handleSyncEnabled).join(", ")}`,
    "",
    "## Flow requirements",
    "0. Inspect existing auth and preserve all working sign-in methods. Do not activate ROUT, Google or any other provider until its start handler, callback and real configuration exist and pass an end-to-end check. Missing configuration must yield a disabled button and a clear setup error, not a fabricated value.",
    "0a. Start authorization ONLY after the user clicks or submits the button. Never auto-redirect on mount, page load, route guard or an effect; never silently log in by default. Account discovery is data linking after a verified callback, NOT authorization to initiate login.",
    "0b. Use a proven OIDC library for state, nonce, PKCE and token validation. Keep login and account linking separate; link only with an existing local session, explicit consent and conflict checks. Do not link an identity already belonging to another local account.",
    "1. Fetch endpoints from the Discovery URL (do not hardcode them).",
    "2. Authorization Code flow with PKCE S256: generate code_verifier, state and nonce per attempt; store them in an HttpOnly, Secure, SameSite=Lax cookie.",
    "3. On the callback, verify `state`, then exchange the code at the token endpoint ON THE SERVER with the code_verifier.",
    "4. Validate the id_token: signature via JWKS (ES256), iss, aud === client_id, exp, and nonce.",
    "5. Create a session for the user; never expose tokens to client-side JavaScript.",
    "6. Map ROUT errors (?error=...) to friendly UI messages.",
    "",
    "## Database changes",
    "- Add a unique `rout_id` (text, the `sub` claim) to the users table.",
    "- Add `email_verified` boolean from the email_verified claim.",
  ];
  if (app.richIdentityEnabled) {
    lines.push(
      "- Rich Identity is enabled: when the member ticked the extra checkbox, the id_token contains `rout_public_activity` (array of { kind, title, occurred_at }). Store it in a jsonb column `rout_public_activity`, overwrite it on every login, and clear it when the claim is absent (the member withdrew consent). Never accept it from client input.",
    );
  }
  if (app.handleSyncEnabled) {
    lines.push(
      "- Universal Handle Sync is enabled: the `rout_handle` claim (requires the `profile` scope) is the user's username. Add a UNIQUE `username` column, set it from `rout_handle` on every login, and do NOT build a separate username picker.",
      "- Add a POST route `/api/webhooks/rout` for the `user.handle.updated` event: verify the `x-rout-signature` header (HMAC-SHA256 of `${t}.${rawBody}` with ROUT_WEBHOOK_SECRET, reject if older than 5 minutes), dedupe on the event `id`, find the user by `data.sub` and update `username` to `data.rout_handle`. Return 2xx quickly; ROUT retries non-2xx responses.",
    );
  }
  if (app.accountDiscoveryEnabled) {
    lines.push(
      "- Account Discovery is enabled: after a user-initiated authorization and verified callback, offer linking when email_verified is true and the email matches an existing local account. Require an authenticated local session, explicit consent and conflict checks; never merge solely because emails match.",
      "- Authorization always requires an explicit button click or form submission. Do not implement silent sign-in or automatic redirects for account discovery.",
    );
  }
  lines.push(...brandingSection());
  lines.push(
    "",
    "## Deliverables",
    "- A 'Login with ROUT' button, callback handler, logout, and the migration.",
    "- No analytics or tracking scripts on the auth pages.",
  );
  return lines.join("\n");
}

export function buildSqlSchema(app: TemplateApp): string {
  const rich =
    (app.handleSyncEnabled ? `,
  username       text unique,           -- ROUT 'rout_handle' claim (Universal Handle Sync)` : "") +
    (app.richIdentityEnabled ? `,
  rout_public_activity jsonb,           -- Rich Identity, only with member consent` : "");
  let out = `-- Users: one row per person in your app
create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text unique,
  email_verified boolean not null default false,
  rout_id        text unique,           -- ROUT 'sub' claim${rich},
  created_at     timestamptz not null default now()
);`;
  if (app.accountDiscoveryEnabled) {
    out += `

-- Account Auto-Discovery: link ROUT to existing accounts instead of duplicating
create table user_identities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  provider    text not null,             -- 'rout', 'password', ...
  provider_id text not null,             -- ROUT 'sub'
  linked_at   timestamptz not null default now(),
  unique (provider, provider_id),        -- one ROUT account → one user
  unique (user_id, provider)             -- one ROUT link per user
);
-- Merge rule: only link when the id_token says email_verified = true.`;
  }
  if (app.handleSyncEnabled) {
    out += `

-- Universal Handle Sync: processed webhook events (idempotency)
create table rout_webhook_events (
  id          text primary key,          -- event id from ROUT
  type        text not null,             -- 'user.handle.updated'
  received_at timestamptz not null default now()
);`;
  }
  return out;
}

export function buildPrismaSchema(app: TemplateApp): string {
  const rich =
    (app.handleSyncEnabled ? `
  username      String?  @unique // ROUT 'rout_handle' claim` : "") +
    (app.richIdentityEnabled ? `
  routPublicActivity Json? @map("rout_public_activity")` : "");
  let out = `model User {
  id            String   @id @default(uuid())
  email         String?  @unique
  emailVerified Boolean  @default(false) @map("email_verified")
  routId        String?  @unique @map("rout_id")${rich}
  createdAt     DateTime @default(now()) @map("created_at")${app.accountDiscoveryEnabled ? "\n  identities    UserIdentity[]" : ""}
}`;
  if (app.accountDiscoveryEnabled) {
    out += `

model UserIdentity {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider   String
  providerId String   @map("provider_id")
  linkedAt   DateTime @default(now()) @map("linked_at")

  @@unique([provider, providerId])
  @@unique([userId, provider])
}`;
  }
  if (app.handleSyncEnabled) {
    out += `

model RoutWebhookEvent {
  id         String   @id
  type       String
  receivedAt DateTime @default(now()) @map("received_at")

  @@map("rout_webhook_events")
}`;
  }
  return out;
}

/* ------------------------------------------- Universal Handle Sync + badges */

export type PromptApp = { name: string; clientId: string };

/** Opening lines shared by every prompt so the chosen assistant + stack apply everywhere. */
function promptIntro(tool: AiTool, stack: Stack): string[] {
  return [TOOLS[tool], `Build this in ${STACKS[stack]}.`, "Preserve existing authentication. Never activate a provider without real configuration, a start handler and a validated callback. Never start login automatically; require an explicit user action. Do not invent credentials, registered redirect URIs or available APIs.", ""];
}

export function buildHandleSyncPrompt(app: PromptApp, tool: AiTool = "generic", stack: Stack = "other"): string {
  return [
    ...promptIntro(tool, stack),
    `I am building an app ("${app.name}") and want to integrate 'Login with ROUT' as my authentication and identity provider.`,
    `Please build the standard OIDC OAuth2 flow using the discovery URL: \`${DISCOVERY_URL}\`.`,
    `My Client ID is: ${app.clientId}.`,
    "CRITICAL REQUIREMENT: Do not build a custom username system. Instead, extract the `rout_handle` claim from ROUT's UserInfo endpoint and map it directly as the primary unique `username` field in our database. Set up an API route to listen for ROUT's `user.handle.updated` webhook to keep the username in sync.",
    "",
    "## Configuration",
    "- Request the exact registered redirect URI before enabling the button. Confidential clients use ROUT_CLIENT_SECRET server-side; public clients use PKCE without a secret.",
    "- Webhook secret: env var ROUT_WEBHOOK_SECRET (server only).",
    "- Scopes: `openid profile email` (`profile` is required for `rout_handle`).",
    "",
    "## Sign-in flow",
    "1. Read all endpoints from the discovery URL; never hardcode them.",
    "2. Authorization Code + PKCE (S256). Generate code_verifier, state and nonce per attempt; keep them in an HttpOnly, Secure, SameSite=Lax cookie.",
    "3. On the callback: check `state`, exchange the code on the server, validate the id_token via JWKS (ES256: iss, aud === client_id, exp, nonce).",
    "4. Call the UserInfo endpoint with the access token and read `sub` and `rout_handle`.",
    "5. Upsert the user by `rout_id = sub` (never by handle — handles can change). Set `username = rout_handle` on every login.",
    "6. Create your own session cookie; never expose tokens to client-side JavaScript.",
    "7. Map `?error=` values (access_denied, login_required, invalid_request…) to friendly messages.",
    "",
    "## Database",
    "- users: `rout_id text unique not null`, `username text unique not null`, `email`, `email_verified`.",
    "- rout_webhook_events: `id text primary key`, `type text`, `received_at timestamptz` (idempotency).",
    "- Users must not be able to edit `username` in your UI; show it as '@handle · managed by ROUT'.",
    "- Conflict: if another local row still holds that username (stale), clear it on that row first inside the same transaction.",
    "",
    "## Webhook: POST /api/webhooks/rout",
    "- Header `x-rout-signature: t=<unix>,v1=<hex>`; v1 = HMAC-SHA256(ROUT_WEBHOOK_SECRET, `${t}.${rawBody}`). Compare in constant time; reject if |now - t| > 300 s.",
    "- Body: { id, type: 'user.handle.updated', created_at, client_id, data: { sub, previous_handle, rout_handle } }.",
    "- Ignore events whose `client_id` is not mine. Skip already-seen `id`s. Update the user where rout_id = data.sub.",
    "- Respond 200 within 5 s; ROUT retries non-2xx responses with backoff.",
    ...brandingSection(),
    "",
    "## Tests to write",
    "- First login creates a user with username = rout_handle.",
    "- Second login with a changed handle updates the username.",
    "- Webhook with a bad signature → 401; with an old timestamp → 401; duplicate event id → 200 without changes.",
  ].join("\n");
}

export function buildBadgePrompt(app: PromptApp, tool: AiTool = "generic", stack: Stack = "other"): string {
  return [
    ...promptIntro(tool, stack),
    `I want to integrate the ROUT Badge Issuance API into "${app.name}" (client_id ${app.clientId}) to send digital certificates to users' ROUT profiles.`,
    "NOTE: this API is NOT implemented in the current ROUT release. Do not call it, enable issuance, show success, or fabricate returned badge IDs. Prepare an adapter disabled by default behind ROUT_BADGES_ENABLED; enable it only after the deployed endpoint and its published contract have been verified. The following contract is proposed, not a working integration.",
    `Please build a backend service that makes an authenticated POST request to \`${ROUT_ISSUER}/api/v1/badges/issue\`.`,
    "Include the Authorization Header: `Bearer <YOUR_SECRET_API_KEY>` read from env var ROUT_API_KEY (server only, never in the browser).",
    "Also send an `Idempotency-Key` header (UUID per certificate) so retries never create duplicate badges.",
    "",
    "## Request body",
    "```json",
    '{ "recipient_handle": "anna", "badge_slug": "course-completed", "issue_date": "2026-10-10",',
    '  "metadata": { "title": "Course completed", "description": "Finished the Advanced course", "verification_url": "https://example.com/verify/abc" } }',
    "```",
    "",
    "## Responses",
    "- 201 Created → store the returned badge id and show a success toast.",
    "- 404 Handle Not Found → show 'This ROUT handle does not exist' and let the admin correct it.",
    "- 401/403 → log and alert: the API key is wrong or lacks permission.",
    "- 429 or 5xx → retry with exponential backoff (max 5 tries) using the same Idempotency-Key.",
    "",
    "## Deliverables",
    "- A server function/route `issueBadge(input)` with input validation (zod).",
    "- An admin UI form with the fields above and a success/error toast.",
    "- A table `issued_badges` (id, recipient_handle, badge_slug, rout_badge_id, idempotency_key unique, created_at).",
  ].join("\n");
}

export const WEBHOOK_VERIFY_SNIPPET = `import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRoutSignature(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // replay window 5 min
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const got = Buffer.from(parts.v1 ?? "", "hex");
  return got.length === 32 && timingSafeEqual(got, Buffer.from(expected, "hex"));
}`;

export function handleUpdatedSample(clientId: string): string {
  return JSON.stringify(
    {
      id: "evt_01J9Z8K3QH4M2N",
      type: "user.handle.updated",
      created_at: "2026-10-10T10:40:00Z",
      client_id: clientId,
      data: { sub: "8f0c2a4e-…", previous_handle: "oldname", rout_handle: "newname" },
    },
    null,
    2,
  );
}

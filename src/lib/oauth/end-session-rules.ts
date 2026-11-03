import { findMatchingRedirect } from "./redirect-match";

/**
 * OpenID Connect RP-Initiated Logout 1.0 — pure validation.
 * A post_logout_redirect_uri is honoured only when it is registered for the
 * client identified by a valid id_token_hint (or explicit client_id that
 * matches the hint's aud). Otherwise the user lands on ROUT itself.
 */
export type EndSessionDecision =
  | { kind: "redirect"; target: string }
  | { kind: "local" };

export function decideEndSessionRedirect(input: {
  requested: string | null;
  state: string | null;
  hintAud: string | null;
  clientId: string | null;
  registered: string[] | null;
}): EndSessionDecision {
  if (!input.requested) return { kind: "local" };
  if (!input.hintAud) return { kind: "local" };
  if (input.clientId && input.clientId !== input.hintAud) return { kind: "local" };
  if (!input.registered) return { kind: "local" };
  const match = findMatchingRedirect(input.registered, input.requested);
  if (!match) return { kind: "local" };
  const target = new URL(input.requested);
  if (input.state) target.searchParams.set("state", input.state);
  return { kind: "redirect", target: target.toString() };
}

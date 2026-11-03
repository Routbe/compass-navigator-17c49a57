/**
 * Standard JSON answers for agent APIs. Every refusal is structured so an
 * LLM agent can show the next step to its human instead of crashing. Pure.
 */

export type AgentErrorCode =
  | "invalid_token"
  | "insufficient_scope"
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "server_error";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export function agentError(status: number, error: AgentErrorCode, message: string, extra: Record<string, unknown> = {}): Response {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (status === 401) headers["www-authenticate"] = `Bearer error="${error}"`;
  if (status === 403 && typeof extra["required_scope"] === "string") {
    headers["www-authenticate"] = `Bearer error="insufficient_scope", scope="${extra["required_scope"]}"`;
  }
  return new Response(JSON.stringify({ status: "error", error, message, ...extra }), { status, headers });
}

export type HumanActionKind = "publish_profile" | "verify_identity" | "verify_domain" | "sign_in";

/**
 * A step only the human can take (publishing live, eID verification). HTTP 202:
 * the request was understood and parked; the agent shows `action_url`.
 */
export function humanActionRequired(input: {
  action: HumanActionKind;
  reason: string;
  actionUrl: string;
  expiresAt: string;
  result?: Record<string, unknown>;
}): Response {
  return new Response(
    JSON.stringify({
      status: "human_action_required",
      action: input.action,
      reason: input.reason,
      action_url: input.actionUrl,
      expires_at: input.expiresAt,
      ...(input.result ? { result: input.result } : {}),
    }),
    { status: 202, headers: JSON_HEADERS },
  );
}

/** Plan limit reached: no free pass for agents. HTTP 402 with an upgrade link. */
export function paymentRequired(input: { reason: string; upgradeUrl: string; limit?: string }): Response {
  return new Response(
    JSON.stringify({
      status: "payment_required",
      reason: input.reason,
      upgrade_url: input.upgradeUrl,
      ...(input.limit ? { limit: input.limit } : {}),
    }),
    { status: 402, headers: JSON_HEADERS },
  );
}

export function agentOk(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ status: "ok", ...body }), { status, headers: JSON_HEADERS });
}

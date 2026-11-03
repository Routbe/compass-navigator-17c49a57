/**
 * ROUT MCP server (`/api/mcp`) — pure, browser-safe protocol layer.
 * JSON-RPC 2.0 over Streamable HTTP (single JSON responses). Write tools
 * delegate to the existing `/api/agent/*` handlers, so scope checks, quotas,
 * Chronos audit and `human_action_required` stay in one place.
 */
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SERVER_INFO = { name: "rout", title: "ROUT", version: "1.0.0" } as const;

export type JsonRpcId = string | number | null;
export type JsonRpcRequest = { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: Record<string, unknown> };

export type McpTool = {
  name: string;
  title: string;
  description: string;
  /** Agent scope the token must carry; null = public read. */
  scope: "assets:write" | "profile:draft" | null;
  /** Existing agent handler the call is delegated to (write tools). */
  agentPath: "/api/agent/links" | "/api/agent/profile/draft" | "/api/agent/workspaces" | null;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
};

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: "rout_read_profile",
    title: "Read a public ROUT profile",
    description: "Returns the public JSON-LD of a profile (rout.be/<handle>), privacy alias (rout.be/u/<handle>) or workspace (rout.be/w/<slug>).",
    scope: null,
    agentPath: null,
    inputSchema: obj({
      kind: { type: "string", enum: ["verified", "alias", "workspace"], description: "Which namespace the handle lives in." },
      handle: { type: "string", minLength: 2, maxLength: 48, description: "Handle or workspace slug, without @." },
    }, ["kind", "handle"]),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "rout_generate_qr",
    title: "Generate a QR code or short link",
    description: "Creates a tracked QR code or short link for the signed-in member, within their plan limits. Requires the assets:write scope.",
    scope: "assets:write",
    agentPath: "/api/agent/links",
    inputSchema: obj({
      target_url: { type: "string", format: "uri", maxLength: 2000, description: "http(s) destination." },
      label: { type: "string", maxLength: 120 },
      kind: { type: "string", enum: ["qr", "link"] },
    }, ["target_url"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "rout_create_draft",
    title: "Prepare a Studio draft",
    description: "Prepares an unpublished profile draft in the Studio. Publishing always stays a human action. Requires the profile:draft scope.",
    scope: "profile:draft",
    agentPath: "/api/agent/profile/draft",
    inputSchema: obj({
      space: { type: "string", enum: ["alias", "verified"] },
      displayName: { type: "string", maxLength: 120 },
      tagline: { type: "string", maxLength: 240 },
      theme: { type: "string", maxLength: 40 },
      cardStyle: { type: "string", maxLength: 40 },
      blocks: { type: "array", maxItems: 100, items: { type: "object" } },
    }, ["space"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "rout_provision_workspace",
    title: "Provision a 48-hour staging workspace",
    description: "Creates an unowned staging workspace and returns a single-use claim URL for the human. No e-mail is sent; unclaimed workspaces are deleted after 48 hours. Requires the assets:write scope.",
    scope: "assets:write",
    agentPath: "/api/agent/workspaces",
    inputSchema: obj({
      name: { type: "string", minLength: 1, maxLength: 120 },
      slug: { type: "string", minLength: 3, maxLength: 48, description: "Lowercase letters, digits and single hyphens." },
      description: { type: "string", maxLength: 500 },
    }, ["name", "slug"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

export function findTool(name: unknown): McpTool | null {
  return MCP_TOOLS.find((t) => t.name === name) ?? null;
}

/** tools/list payload (no internal routing fields). */
export function listTools() {
  return MCP_TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations }));
}

export function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

export function isRpcRequest(v: unknown): v is JsonRpcRequest {
  return !!v && typeof v === "object" && (v as { jsonrpc?: unknown }).jsonrpc === "2.0" && typeof (v as { method?: unknown }).method === "string";
}

/**
 * Agent handler response → MCP tool result. 202 `human_action_required` is a
 * successful, structured answer (the agent shows `action_url` to its human);
 * 4xx/5xx become `isError` results carrying the ROUT error body.
 */
export function toolResultFromAgent(status: number, body: unknown) {
  const structured = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : { value: body };
  return {
    content: [{ type: "text", text: JSON.stringify(structured) }],
    structuredContent: { ...structured, http_status: status },
    isError: status >= 400,
  };
}

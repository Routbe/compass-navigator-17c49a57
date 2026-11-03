import { describe, expect, it } from "vitest";
import { MCP_TOOLS, findTool, listTools, toolResultFromAgent } from "./protocol";

describe("ROUT MCP protocol", () => {
  it("lists exactly the four ROUT tools", () => {
    expect(listTools().map((t) => t.name)).toEqual(["rout_read_profile", "rout_generate_qr", "rout_create_draft", "rout_provision_workspace"]);
  });
  it("write tools require their agent scopes", () => {
    expect(findTool("rout_generate_qr")?.scope).toBe("assets:write");
    expect(findTool("rout_create_draft")?.scope).toBe("profile:draft");
    expect(findTool("rout_provision_workspace")?.scope).toBe("assets:write");
    expect(findTool("rout_read_profile")?.scope).toBeNull();
  });
  it("every write tool delegates to an audited agent handler", () => {
    for (const t of MCP_TOOLS) if (t.scope) expect(t.agentPath).toMatch(/^\/api\/agent\//);
  });
  it("human_action_required (202) is not an error; 403 is", () => {
    expect(toolResultFromAgent(202, { status: "human_action_required" }).isError).toBe(false);
    expect(toolResultFromAgent(403, { error: "insufficient_scope" }).isError).toBe(true);
  });
});

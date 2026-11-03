import { describe, expect, it } from "vitest";
import { decideEndSessionRedirect } from "./end-session-rules";

const base = { state: "s1", clientId: null, registered: ["https://app.example.com/bye"] };

describe("RP-initiated logout redirect", () => {
  it("redirects to a registered URI with a valid hint and echoes state", () => {
    const d = decideEndSessionRedirect({ ...base, requested: "https://app.example.com/bye", hintAud: "c1" });
    expect(d).toEqual({ kind: "redirect", target: "https://app.example.com/bye?state=s1" });
  });
  it("refuses an unregistered URI", () => {
    expect(decideEndSessionRedirect({ ...base, requested: "https://evil.example/bye", hintAud: "c1" }).kind).toBe("local");
  });
  it("refuses a redirect without id_token_hint", () => {
    expect(decideEndSessionRedirect({ ...base, requested: "https://app.example.com/bye", hintAud: null }).kind).toBe("local");
  });
  it("refuses when client_id differs from the hint audience", () => {
    expect(decideEndSessionRedirect({ ...base, clientId: "c2", requested: "https://app.example.com/bye", hintAud: "c1" }).kind).toBe("local");
  });
});

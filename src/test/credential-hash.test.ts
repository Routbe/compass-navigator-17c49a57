import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password.server";
import { hashCredential, verifyCredentialHash } from "@/lib/auth/credential-hash.server";

describe("credential hash verification", () => {
  it("accepts a migrated legacy pbkdf2 password", async () => {
    const hash = await hashPassword("correct-horse-1");
    expect(await verifyCredentialHash({ hash, password: "correct-horse-1" })).toBe(true);
    expect(await verifyCredentialHash({ hash, password: "wrong-horse-1" })).toBe(false);
  });
  it("accepts a Better Auth scrypt password", async () => {
    const hash = await hashCredential("correct-horse-2");
    expect(hash.startsWith("pbkdf2$")).toBe(false);
    expect(await verifyCredentialHash({ hash, password: "correct-horse-2" })).toBe(true);
    expect(await verifyCredentialHash({ hash, password: "nope-nope-nope" })).toBe(false);
  });
});

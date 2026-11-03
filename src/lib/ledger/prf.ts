/** Optional PRF only: unsupported authenticators never fall back to server-known secrets. */
export async function ledgerPrf(credentialId?: string): Promise<{ output: Uint8Array; credentialId: string } | null> {
  const { fromBase64, toBase64 } = await import("./crypto");
  const salt = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ROUT-ledger-private-key-PRF:v1"));
  const extensions = { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs;
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification: "required", timeout: 60000,
    ...(credentialId ? { allowCredentials: [{ type: "public-key" as const, id: fromBase64(credentialId) }] } : {}), extensions,
  } }) as PublicKeyCredential | null;
  if (!credential) return null;
  const results = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & { prf?: { results?: { first?: ArrayBuffer } } };
  const output = results.prf?.results?.first;
  return output ? { output: new Uint8Array(output), credentialId: toBase64(new Uint8Array(credential.rawId)) } : null;
}
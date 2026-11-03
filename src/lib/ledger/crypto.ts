/** Browser-safe envelope cryptography. No session tokens, server secrets or storage. */
export const LEDGER_CONTEXT = "ROUT-ledger:v1";
const encode = new TextEncoder();
const decode = new TextDecoder();
export const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
export const fromBase64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export type LedgerEnvelope = { v: 1; keyId: string; wrappedKey: string; iv: string; ciphertext: string };
export type PrivateEnvelope = { v: 1; source: "recovery" | "prf"; salt: string; iv: string; ciphertext: string };
export type LedgerKeys = { keyId: string; publicKey: JsonWebKey; privateKey: CryptoKey; recoveryCode: string; envelopes: PrivateEnvelope[] };

export async function publicKeyId(publicKey: JsonWebKey) {
  if (publicKey.kty !== "RSA" || !publicKey.n || publicKey.e !== "AQAB" || publicKey.d) throw new Error("Invalid ledger public key");
  const hash = await crypto.subtle.digest("SHA-256", encode.encode(JSON.stringify({ kty: "RSA", n: publicKey.n, e: publicKey.e })));
  return toBase64(new Uint8Array(hash));
}

async function wrappingKey(material: Uint8Array, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", new Uint8Array(material), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(salt), info: encode.encode(`${LEDGER_CONTEXT}:private-key`) }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function recoveryMaterial(code: string) {
  if (!/^ROUT-RCVR-[A-F0-9]{64}$/.test(code)) throw new Error("Ongeldige herstelcode");
  return Uint8Array.from(code.slice(10).match(/.{2}/g) ?? [], (hex) => parseInt(hex, 16));
}

export async function wrapPrivateKey(privateKey: CryptoKey, material: Uint8Array, source: PrivateEnvelope["source"], keyId: string): Promise<PrivateEnvelope> {
  if (material.length < 32) throw new Error("Wrapping secret must have at least 256 bits");
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encode.encode(`${LEDGER_CONTEXT}:${keyId}:${source}`) }, await wrappingKey(material, salt), exported);
  return { v: 1, source, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function generateLedgerKeys(prfOutput?: Uint8Array): Promise<LedgerKeys> {
  const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const keyId = await publicKeyId(publicKey);
  const recoveryCode = `ROUT-RCVR-${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  const envelopes = [await wrapPrivateKey(pair.privateKey, recoveryMaterial(recoveryCode), "recovery", keyId)];
  if (prfOutput) envelopes.push(await wrapPrivateKey(pair.privateKey, prfOutput, "prf", keyId));
  // Return only a non-extractable key after preparing the envelopes.
  const privateKey = await crypto.subtle.importKey("pkcs8", await crypto.subtle.exportKey("pkcs8", pair.privateKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  return { keyId, publicKey, privateKey, recoveryCode, envelopes };
}

export async function unlockLedgerKey(envelope: PrivateEnvelope, keyId: string, material: string | Uint8Array) {
  if (envelope.v !== 1) throw new Error("Unknown private key envelope");
  const secret = typeof material === "string" ? recoveryMaterial(material) : material;
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData: encode.encode(`${LEDGER_CONTEXT}:${keyId}:${envelope.source}`) },
    await wrappingKey(secret, fromBase64(envelope.salt)), fromBase64(envelope.ciphertext));
  return crypto.subtle.importKey("pkcs8", bytes, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
}

/** Hybrid encryption permits arbitrarily sized JSON; RSA encrypts only the AES key. */
export async function encryptLedgerEvent(publicKey: JsonWebKey, payload: unknown): Promise<string> {
  const keyId = await publicKeyId(publicKey);
  const rsa = await crypto.subtle.importKey("jwk", publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encode.encode(`${LEDGER_CONTEXT}:${keyId}`) }, key, encode.encode(JSON.stringify(payload)));
  const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsa, keyBytes);
  keyBytes.fill(0);
  return JSON.stringify({ v: 1, keyId, wrappedKey: toBase64(new Uint8Array(wrapped)), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) } satisfies LedgerEnvelope);
}

export async function decryptLedgerEvent(privateKey: CryptoKey, encryptedPayload: string): Promise<unknown> {
  const envelope = JSON.parse(encryptedPayload) as LedgerEnvelope;
  if (envelope.v !== 1) throw new Error("Unknown ledger envelope");
  const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, fromBase64(envelope.wrappedKey));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv), additionalData: encode.encode(`${LEDGER_CONTEXT}:${envelope.keyId}`) }, aes, fromBase64(envelope.ciphertext));
  return JSON.parse(decode.decode(plaintext));
}
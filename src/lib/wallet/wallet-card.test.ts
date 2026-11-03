import { describe, expect, it } from "vitest";
import {
  appleCardPassJson,
  googleCardObject,
  sovereignIdFromDigest,
  walletCardPayload,
  walletForeground,
  WALLET_DEFAULT_SUBHEADER,
} from "./wallet-pass";

const base = "https://rout.be";
const root = walletCardPayload({ handle: "Jona", space: "root", displayName: "Jona Zeno", tagline: null, themeBg: "#0d0d0d", avatarSrc: "/api/public/avatar?path=x/y.webp" }, base, "ROUT-ABCD-1234");
const alias = walletCardPayload({ handle: "studio", space: "alias", displayName: null, tagline: "Maker  van dingen", themeBg: "#f7f4ef", avatarSrc: "https://evil.example/a.png" }, base, "ROUT-0000-0000");

describe("ROUT Card wallet payload", () => {
  it("QR points at the real public profile: root at /@<handle>, alias at /u/<handle>", () => {
    expect(root.qrValue).toBe("https://rout.be/@jona");
    expect(alias.qrValue).toBe("https://rout.be/u/studio");
  });

  it("uses the bio as subheader, falling back to 'Sovereign Profile Hub'", () => {
    expect(root.subheader).toBe(WALLET_DEFAULT_SUBHEADER);
    expect(alias.subheader).toBe("Maker van dingen");
  });

  it("only uses ROUT's own image routes for the hero image", () => {
    expect(root.heroImageUrl).toBe("https://rout.be/api/public/avatar?path=x/y.webp");
    expect(alias.heroImageUrl).toBeNull();
  });

  it("Google object carries handle, theme colour and a QR_CODE barcode", () => {
    const o = googleCardObject(root, "3388000000000000000");
    expect(o.classId).toBe("3388000000000000000.rout_card");
    expect(o.header.defaultValue.value).toBe("@jona");
    expect(o.hexBackgroundColor).toBe("#0d0d0d");
    expect(o.barcode).toMatchObject({ type: "QR_CODE", value: "https://rout.be/@jona" });
    expect(o.heroImage?.sourceUri.uri).toBe(root.heroImageUrl);
  });

  it("Apple pass shows the same QR and colours as Google", () => {
    const p = appleCardPassJson(root, { passTypeId: "pass.be.rout", teamId: "TEAM" });
    expect(p.barcodes[0]?.message).toBe(root.qrValue);
    expect(p.backgroundColor).toBe("rgb(13, 13, 13)");
    expect(p.foregroundColor).toBe("rgb(255, 255, 255)");
  });

  it("picks readable text colours and hash-based card numbers", () => {
    expect(walletForeground("#f7f4ef")).toBe("#111111");
    expect(walletForeground("#0d0d0d")).toBe("#ffffff");
    expect(sovereignIdFromDigest("ab12cd34ef")).toBe("ROUT-AB12-CD34");
  });
});

describe("Google Wallet save link signing", () => {
  it("produces an RS256 JWT Google can verify, carrying the ROUT Card object", async () => {
    const { generateKeyPair, exportPKCS8, jwtVerify } = await import("jose");
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    const { googleCardSave } = await import("./google-wallet.server");
    const pem = await exportPKCS8(privateKey);
    const { jwt, saveUrl } = await googleCardSave(root, base, { issuerId: "3388", serviceAccountEmail: "sa@x.iam.gserviceaccount.com", privateKey: pem });
    expect(saveUrl).toBe(`https://pay.google.com/gp/v/save/${jwt}`);
    const { payload, protectedHeader } = await jwtVerify(jwt, publicKey, { audience: "google", issuer: "sa@x.iam.gserviceaccount.com" });
    expect(protectedHeader.alg).toBe("RS256");
    const obj = (payload as { payload: { genericObjects: { barcode: { value: string } }[] } }).payload.genericObjects[0];
    expect(obj?.barcode.value).toBe("https://rout.be/@jona");
  });
});

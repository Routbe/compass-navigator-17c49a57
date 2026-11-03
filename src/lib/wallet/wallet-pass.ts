/**
 * Wallet pass content for profiles and events (pure, browser-safe).
 * Apple (.pkpass pass.json) and Google (Generic pass object) are built from the
 * same subject so both wallets always show the same card.
 */

export type WalletKind = "profile" | "event";
export type WalletSubject = {
  kind: WalletKind;
  /** Stable id: profile handle or event slug. */
  id: string;
  title: string;
  subtitle: string;
  url: string;
  /** ISO start time (events only). */
  startsAt?: string | null;
  venue?: string | null;
  /**
   * Events only: true when a paid or verified booking proves access. Without
   * it the pass is informational and carries no barcode or access claim.
   */
  accessClaim?: boolean;
};

export type WalletStatus = { apple: boolean; google: boolean };

type Env = Record<string, string | undefined>;
const pick = (env: Env, ...keys: string[]) => keys.map((k) => env[k]?.trim()).find((v) => !!v) ?? "";

export type AppleWalletConfig = { passTypeId: string; teamId: string; certPem: string; keyPem: string; passphrase: string; wwdrPem: string };
export type GoogleWalletConfig = { issuerId: string; serviceAccountEmail: string; privateKey: string };

/** Resolves Apple config; accepts both APPLE_WALLET_* and APPLE_PASS_* names. Null = not (fully) configured. */
export function appleWalletConfig(env: Env): AppleWalletConfig | null {
  const c = {
    passTypeId: pick(env, "APPLE_WALLET_PASS_TYPE_ID", "APPLE_PASS_TYPE_ID"),
    teamId: pick(env, "APPLE_WALLET_TEAM_ID", "APPLE_TEAM_ID"),
    certPem: pick(env, "APPLE_WALLET_CERT_PEM", "APPLE_PASS_CERTIFICATE"),
    keyPem: pick(env, "APPLE_WALLET_KEY_PEM", "APPLE_PASS_KEY"),
    passphrase: pick(env, "APPLE_WALLET_KEY_PASSPHRASE", "APPLE_PASS_KEY_PASSPHRASE"),
    wwdrPem: pick(env, "APPLE_WALLET_WWDR_PEM", "APPLE_WWDR_CERTIFICATE"),
  };
  return c.passTypeId && c.teamId && c.certPem && c.keyPem && c.wwdrPem ? c : null;
}

/** Resolves Google config from separate vars or the service-account JSON (GOOGLE_WALLET_SERVICE_ACCOUNT). */
export function googleWalletConfig(env: Env): GoogleWalletConfig | null {
  let email = pick(env, "GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL");
  let key = pick(env, "GOOGLE_WALLET_PRIVATE_KEY");
  const json = pick(env, "GOOGLE_WALLET_SERVICE_ACCOUNT");
  if (json && (!email || !key)) {
    try {
      const sa = JSON.parse(json) as { client_email?: unknown; private_key?: unknown };
      if (!email && typeof sa.client_email === "string") email = sa.client_email;
      if (!key && typeof sa.private_key === "string") key = sa.private_key;
    } catch {
      /* malformed JSON = not configured */
    }
  }
  const issuerId = pick(env, "GOOGLE_WALLET_ISSUER_ID");
  return issuerId && email && key ? { issuerId, serviceAccountEmail: email, privateKey: key } : null;
}

/** Which wallets can issue passes; partial configuration counts as off. */
export function walletStatus(env: Env): WalletStatus {
  return { apple: !!appleWalletConfig(env), google: !!googleWalletConfig(env) };
}

export function isWalletKind(v: unknown): v is WalletKind {
  return v === "profile" || v === "event";
}

/** Serial/object suffix: only [a-z0-9._-], max 64 chars, kind-prefixed so ids never collide. */
export function walletSerial(s: Pick<WalletSubject, "kind" | "id">): string {
  return `${s.kind}-${s.id.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}`.slice(0, 64);
}

const clip = (v: string | null | undefined, n: number) => (v ?? "").slice(0, n);

/** Apple pass.json (generic style). */
export function applePassJson(s: WalletSubject, cfg: { passTypeId: string; teamId: string }) {
  const isEvent = s.kind === "event";
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: walletSerial(s),
    organizationName: "ROUT",
    description: isEvent ? `Evenement: ${clip(s.title, 60)}` : `ROUT-visitekaartje van ${clip(s.title, 60)}`,
    logoText: "ROUT",
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: "rgb(17, 17, 17)",
    labelColor: "rgb(180, 180, 180)",
    ...(isEvent && s.startsAt ? { relevantDate: s.startsAt } : {}),
    // Barcode = toegangsclaim: bij events alleen met een bewezen betaalde of
    // geverifieerde boeking. Informatieve passes krijgen geen barcode.
    ...(!isEvent || s.accessClaim === true
      ? { barcodes: [{ format: "PKBarcodeFormatQR", message: s.url, messageEncoding: "iso-8859-1", altText: clip(s.url.replace(/^https?:\/\//, ""), 60) }] }
      : {}),
    generic: {
      primaryFields: [{ key: "title", label: isEvent ? (s.accessClaim === true ? "EVENEMENT" : "INFORMATIEF") : "PROFIEL", value: clip(s.title, 60) }],
      secondaryFields: [{ key: "subtitle", label: isEvent ? "WANNEER" : "HANDLE", value: clip(s.subtitle, 60) }],
      ...(isEvent && s.venue ? { auxiliaryFields: [{ key: "venue", label: "LOCATIE", value: clip(s.venue, 60) }] } : {}),
      backFields: [{ key: "link", label: "Link", value: s.url }],
    },
  };
}

/** Google Wallet "Save to Google Wallet" JWT claims (class + object inline). */
export function googleSaveClaims(s: WalletSubject, cfg: { issuerId: string; serviceAccountEmail: string; origins: string[] }) {
  const classId = `${cfg.issuerId}.rout_${s.kind}`;
  const object = {
    id: `${cfg.issuerId}.${walletSerial(s).replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    classId,
    state: "ACTIVE",
    hexBackgroundColor: "#111111",
    cardTitle: { defaultValue: { language: "nl", value: "ROUT" } },
    header: { defaultValue: { language: "nl", value: clip(s.title, 60) } },
    subheader: { defaultValue: { language: "nl", value: s.kind === "event" ? (s.accessClaim === true ? "Evenement" : "Informatief") : "Profiel" } },
    textModulesData: [
      { id: "subtitle", header: s.kind === "event" ? "Wanneer" : "Handle", body: clip(s.subtitle, 120) },
      ...(s.venue ? [{ id: "venue", header: "Locatie", body: clip(s.venue, 120) }] : []),
    ],
    // Zie applePassJson: een barcode is een toegangsclaim en vereist bewijs.
    ...(s.kind !== "event" || s.accessClaim === true
      ? { barcode: { type: "QR_CODE", value: s.url, alternateText: clip(s.url.replace(/^https?:\/\//, ""), 60) } }
      : {}),
    linksModuleData: { uris: [{ uri: s.url, description: "Open in ROUT", id: "open" }] },
  };
  return {
    iss: cfg.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    origins: cfg.origins,
    payload: { genericClasses: [{ id: classId }], genericObjects: [object] },
  };
}

/* ------------------------------------------------------------------ ROUT Card */

/**
 * One wallet-neutral description of a member's ROUT Card. Google (Generic
 * object), Apple (.pkpass) and the in-app 3D card are all rendered from this,
 * so every surface shows the same name, colours and scannable QR target.
 */
export type WalletCardPayload = {
  serial: string;
  handle: string;
  space: "root" | "alias";
  displayName: string;
  subheader: string;
  /** Public profile URL; also the QR value. Root: /<handle>, alias: /u/<handle>. */
  url: string;
  qrValue: string;
  hexBackgroundColor: string;
  hexForegroundColor: string;
  /** Absolute https URL through ROUT's own avatar/proxy route, or null. */
  heroImageUrl: string | null;
  /** Short public card number, derived from a hash (never the raw account id). */
  sovereignId: string;
};

export const WALLET_DEFAULT_SUBHEADER = "Sovereign Profile Hub";
const HEX6 = /^#[0-9a-f]{6}$/i;

/** Readable text colour for a background (WCAG relative luminance). */
export function walletForeground(bg: string): string {
  if (!HEX6.test(bg)) return "#ffffff";
  const ch = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  return lum > 0.45 ? "#111111" : "#ffffff";
}

/** Card number from a SHA-256 hex digest: ROUT-XXXX-XXXX. */
export function sovereignIdFromDigest(hex: string): string {
  const h = hex.replace(/[^0-9a-f]/gi, "").toUpperCase().padEnd(8, "0");
  return `ROUT-${h.slice(0, 4)}-${h.slice(4, 8)}`;
}

/** Turns stored image paths into an absolute same-origin URL; anything else is dropped. */
export function walletImageUrl(src: string | null, base: string): string | null {
  if (!src) return null;
  if (/^\/api\/public\/(avatar|proxy-image|integrations\/mastodon\/avatar)\?/.test(src)) return `${base}${src}`;
  return null;
}

export function walletCardPayload(
  p: { handle: string; space: "root" | "alias"; displayName: string | null; tagline: string | null; themeBg: string | null; avatarSrc: string | null },
  base: string,
  sovereignId: string,
  /** Handle-independent seed so a renamed handle keeps the same saved pass. */
  serialSeed?: string,
): WalletCardPayload {
  const handle = p.handle.toLowerCase();
  // Canonical public addresses (no redirect hop when scanned): root /@handle, alias /u/handle.
  const url = `${base}/${p.space === "alias" ? "u/" : "@"}${encodeURIComponent(handle)}`;
  const bg = p.themeBg && HEX6.test(p.themeBg) ? p.themeBg.toLowerCase() : "#111111";
  const tagline = (p.tagline ?? "").replace(/\s+/g, " ").trim();
  return {
    serial: walletSerial({ kind: "profile", id: `${p.space}-${serialSeed ?? handle}` }),
    handle,
    space: p.space,
    displayName: clip(p.displayName?.trim() || `@${handle}`, 60),
    subheader: clip(tagline || WALLET_DEFAULT_SUBHEADER, 80),
    url,
    qrValue: url,
    hexBackgroundColor: bg,
    hexForegroundColor: walletForeground(bg),
    heroImageUrl: walletImageUrl(p.avatarSrc, base),
    sovereignId,
  };
}

/** Google Generic object for a ROUT Card. */
export function googleCardObject(card: WalletCardPayload, issuerId: string) {
  const i18n = (value: string) => ({ defaultValue: { language: "nl", value } });
  return {
    id: `${issuerId}.${card.serial.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
    classId: `${issuerId}.rout_card`,
    state: "ACTIVE",
    hexBackgroundColor: card.hexBackgroundColor,
    cardTitle: i18n("ROUT"),
    header: i18n(`@${card.handle}`),
    subheader: i18n(card.subheader),
    textModulesData: [
      { id: "name", header: "Naam", body: card.displayName },
      { id: "card", header: "Kaartnummer", body: card.sovereignId },
    ],
    barcode: { type: "QR_CODE", value: card.qrValue, alternateText: clip(card.url.replace(/^https?:\/\//, ""), 60) },
    ...(card.heroImageUrl
      ? { heroImage: { sourceUri: { uri: card.heroImageUrl }, contentDescription: i18n(`Profielfoto van ${card.displayName}`) } }
      : {}),
    linksModuleData: { uris: [{ uri: card.url, description: "Open profiel", id: "open" }] },
  };
}

export function googleCardSaveClaims(card: WalletCardPayload, cfg: { issuerId: string; serviceAccountEmail: string; origins: string[] }) {
  const object = googleCardObject(card, cfg.issuerId);
  return {
    iss: cfg.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    origins: cfg.origins,
    payload: { genericClasses: [{ id: object.classId }], genericObjects: [object] },
  };
}

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

/** Apple pass.json for the same ROUT Card (generic style, ready for the PassKit signer). */
export function appleCardPassJson(card: WalletCardPayload, cfg: { passTypeId: string; teamId: string }) {
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: card.serial,
    organizationName: "ROUT",
    description: `ROUT-visitekaartje van ${card.displayName}`,
    logoText: "ROUT",
    foregroundColor: rgb(card.hexForegroundColor),
    backgroundColor: rgb(card.hexBackgroundColor),
    labelColor: rgb(card.hexForegroundColor),
    barcodes: [{ format: "PKBarcodeFormatQR", message: card.qrValue, messageEncoding: "iso-8859-1", altText: clip(card.url.replace(/^https?:\/\//, ""), 60) }],
    generic: {
      primaryFields: [{ key: "name", label: "PROFIEL", value: card.displayName }],
      secondaryFields: [{ key: "handle", label: "HANDLE", value: `@${card.handle}` }],
      auxiliaryFields: [{ key: "card", label: "KAART", value: card.sovereignId }],
      backFields: [
        { key: "about", label: "Over", value: card.subheader },
        { key: "link", label: "Link", value: card.url },
      ],
    },
  };
}

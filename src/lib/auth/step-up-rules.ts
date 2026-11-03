/**
 * Pure rules for step-up re-verification on sensitive actions.
 * Passkey or TOTP are required once either is enrolled; an e-mail code is only a
 * fallback for accounts that have neither.
 */
export const STEP_UP_MAX_AGE_SEC = 120;
export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED";
export const STEP_UP_COOKIE = "rout_stepup";

export type StepUpMethod = "passkey" | "totp" | "email";
export type StepUpAction = "vault_export" | "account_delete" | "oauth_secret" | "workspace_role" | "account_merge" | "oauth_subject_type" | "primary_email_change" | "app_email_reassign" | "app_email_revoke";

export function allowedStepUpMethods(enrolled: { passkey: boolean; totp: boolean }): StepUpMethod[] {
  const strong: StepUpMethod[] = [];
  if (enrolled.passkey) strong.push("passkey");
  if (enrolled.totp) strong.push("totp");
  return strong.length ? strong : ["email"];
}

export function stepUpPayload(userId: string, method: StepUpMethod, verifiedAtSec: number): string {
  return `v1.${userId}.${method}.${verifiedAtSec}`;
}

/** Parses a payload and checks owner + freshness; returns the method or null. */
export function checkStepUpPayload(payload: string, userId: string, nowSec: number): StepUpMethod | null {
  const parts = payload.split(".");
  if (parts.length !== 4) return null;
  const [v, uid, method, ts] = parts;
  if (v !== "v1" || uid !== userId) return null;
  if (method !== "passkey" && method !== "totp" && method !== "email") return null;
  const at = Number(ts);
  if (!Number.isFinite(at) || at > nowSec + 5) return null;
  return nowSec - at <= STEP_UP_MAX_AGE_SEC ? method : null;
}

export function isStepUpRequiredError(e: unknown): boolean {
  return e instanceof Error && e.message.includes(STEP_UP_REQUIRED);
}

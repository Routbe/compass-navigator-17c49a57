import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { STEP_UP_MAX_AGE_SEC, allowedStepUpMethods } from "@/lib/auth/step-up-rules";

/** Which methods this account may use for step-up. */
export const getStepUpOptions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { enrolledFactors } = await import("./step-up.server");
    const enrolled = await enrolledFactors(context.userId);
    return { methods: allowedStepUpMethods(enrolled), enrolled };
  });

export const sendStepUpEmail = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { enrolledFactors } = await import("./step-up.server");
    if (!allowedStepUpMethods(await enrolledFactors(context.userId)).includes("email")) {
      throw new Error("Gebruik je passkey of authenticator-app.");
    }
    const { issueSecurityCode } = await import("@/lib/security-code.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    await issueSecurityCode(context.userId, "step_up", getRequest());
    return { ok: true as const };
  });

export const completeStepUp = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ method: z.enum(["passkey", "totp", "email"]), code: z.string().regex(/^\d{6}$/).optional() })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (data.method === "email") {
      const { consumeSecurityCode } = await import("@/lib/security-code.server");
      if (!data.code || !(await consumeSecurityCode(context.userId, "step_up", data.code))) {
        throw new Error("De code klopt niet of is verlopen.");
      }
    } else if (data.method === "totp") {
      if (!data.code) throw new Error("Vul de 6-cijferige code in.");
      const { createRoutAuth } = await import("@/lib/better-auth.server");
      try {
        // The twoFactor plugin adds verifyTOTP; the factory's return type does not carry plugin endpoints.
        const api = createRoutAuth(request).api as unknown as {
          verifyTOTP: (o: { headers: Headers; body: { code: string } }) => Promise<unknown>;
        };
        await api.verifyTOTP({ headers: request.headers, body: { code: data.code } });
      } catch {
        throw new Error("De code klopt niet.");
      }
    } else {
      const { requirePasskeyStepUp } = await import("./step-up-guard.server");
      await requirePasskeyStepUp(context.userId, "primary_email_change");
      // Only the verified WebAuthn hook grants passkey proofs. Never renew an old proof here.
      return { ok: true as const };
    }
    const { grantStepUp } = await import("./step-up.server");
    await grantStepUp(context.userId, data.method);
    return { ok: true as const };
  });

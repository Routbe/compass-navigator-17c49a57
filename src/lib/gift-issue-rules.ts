import { z } from "zod";

export const giftIssueSchema = z.object({
  kind: z.enum(["fixed", "percentage"]).default("fixed"),
  amountCents: z.number().int().min(500).max(50_000).optional(),
  percentOff: z.number().int().min(1).max(100).optional(),
  maxDiscountCents: z.number().int().positive().max(50_000).nullable().optional(),
  maxRedemptions: z.number().int().min(1).max(10_000).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  recipientEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
  recipientUserId: z.string().uuid().nullable().optional(),
  recipientName: z.string().trim().max(80).optional(),
  message: z.string().trim().max(300).optional(),
  language: z.enum(["nl", "en", "fr", "de"]).default("nl"),
  sendEmail: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.kind === "fixed" && data.amountCents === undefined) ctx.addIssue({ code: "custom", path: ["amountCents"], message: "Amount required" });
  if (data.kind === "percentage" && data.percentOff === undefined) ctx.addIssue({ code: "custom", path: ["percentOff"], message: "Percentage required" });
  if (data.sendEmail && !data.recipientEmail && !data.recipientUserId) ctx.addIssue({ code: "custom", path: ["recipientEmail"], message: "Recipient required" });
  if (data.expiresAt && Date.parse(data.expiresAt) <= Date.now()) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be in the future" });
});

export type GiftIssueInput = z.infer<typeof giftIssueSchema>;

export function giftDiscount(input: GiftIssueInput) {
  return input.kind === "fixed"
    ? { percentOff: 0, amountOffCents: input.amountCents ?? 0, maxDiscountCents: null }
    : { percentOff: input.percentOff ?? 0, amountOffCents: 0, maxDiscountCents: input.maxDiscountCents ?? null };
}

export function requireGiftActivation(result: "activated" | "duplicate" | "not_found") {
  if (result === "not_found") throw new Error("gift_activation_failed");
}
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { normalizeQrSettings } from "@/lib/qr-settings";

export const getQrSettingsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    const rows = await sql`select display_prefs->'qrSettings' as style from public.profiles where id = ${context.userId}`;
    return normalizeQrSettings(rows[0]?.style);
  });

/** Standalone opslag van de profiel-QR-stijl in `profiles.display_prefs->'qrSettings'`. */
export const saveQrSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => {
    const style = normalizeQrSettings(data);
    if (!style) throw new Error("invalid_qr_settings");
    return style;
  })
  .handler(async ({ data, context }) => {
    const { savePublishedProfileQr } = await import("@/lib/profile-drafts.server");
    await savePublishedProfileQr(context.userId, data);
    return { ok: true as const, qrSettings: data };
  });

/** Same as saveQrSettingsFn, but for a workspace profile the caller may edit. */
export const saveWorkspaceQrSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as { workspaceId?: unknown; style?: unknown };
    if (typeof d.workspaceId !== "string" || !/^[0-9a-f-]{36}$/i.test(d.workspaceId)) throw new Error("invalid_workspace");
    const style = normalizeQrSettings(d.style);
    if (!style) throw new Error("invalid_qr_settings");
    return { workspaceId: d.workspaceId, style };
  })
  .handler(async ({ data, context }) => {
    const { getWorkspaceRole } = await import("@/lib/workspaces.server");
    const { canEditWorkspaceHub } = await import("@/lib/workspace-rules");
    if (!canEditWorkspaceHub(await getWorkspaceRole(context.userId, data.workspaceId))) throw new Error("forbidden");
    const { saveWorkspaceQr } = await import("@/lib/workspace-studio.server");
    await saveWorkspaceQr(data.workspaceId, data.style);
    return { ok: true as const, qrSettings: data.style };
  });

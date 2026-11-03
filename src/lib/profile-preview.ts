/** Separate namespaces: an alias must never render a same-named root profile. */
export function profilePreviewPath(handle: string, space: "root" | "alias" | "workspace" = "root", format: "png" | "svg" = "png") {
  return `/api/public/og/${encodeURIComponent(handle.replace(/^@+/, "").trim())}.${format}${space === "root" ? "" : `?space=${space}`}`;
}
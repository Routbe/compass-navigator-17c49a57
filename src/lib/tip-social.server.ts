/**
 * Haalt openbare foto's op van Bluesky (publieke AppView) of Mastodon (open API).
 * Enkel openbare berichten, gevoelige/gemarkeerde media worden overgeslagen, en
 * alleen afbeeldingen die via onze beeldproxy mogen worden teruggegeven.
 */
import { isPublicHost } from "@/lib/open-web-rules";
import { isAllowedProxyUrl } from "@/lib/image-proxy-rules";

export type SocialImage = { url: string; alt: string; postUrl: string };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
}

async function bluesky(handle: string): Promise<SocialImage[]> {
  const feed = (await getJson(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&filter=posts_with_media&limit=40`,
  )) as { feed?: Array<{ post?: { uri?: string; labels?: Array<{ val?: string }>; embed?: { images?: Array<{ fullsize?: string; alt?: string }> } } }> };
  const out: SocialImage[] = [];
  for (const item of feed.feed ?? []) {
    const post = item.post;
    if (!post || (post.labels ?? []).some((l) => /porn|sexual|nudity|graphic|gore/.test(l.val ?? ""))) continue;
    const rkey = post.uri?.split("/").pop() ?? "";
    for (const img of post.embed?.images ?? []) {
      if (img.fullsize) out.push({ url: img.fullsize, alt: img.alt ?? "", postUrl: `https://bsky.app/profile/${handle}/post/${rkey}` });
    }
  }
  return out;
}

async function mastodon(full: string): Promise<SocialImage[]> {
  const [user, host] = full.replace(/^@/, "").split("@");
  if (!user || !host || !isPublicHost(host)) return [];
  const acct = (await getJson(`https://${host}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`)) as { id?: string };
  if (!acct.id) return [];
  const statuses = (await getJson(
    `https://${host}/api/v1/accounts/${encodeURIComponent(acct.id)}/statuses?only_media=true&exclude_replies=true&exclude_reblogs=true&limit=40`,
  )) as Array<{ url?: string; sensitive?: boolean; visibility?: string; media_attachments?: Array<{ type?: string; url?: string; description?: string | null }> }>;
  const out: SocialImage[] = [];
  for (const st of statuses) {
    if (st.sensitive || st.visibility !== "public") continue;
    for (const m of st.media_attachments ?? []) {
      if (m.type === "image" && m.url) out.push({ url: m.url, alt: m.description ?? "", postUrl: st.url ?? "" });
    }
  }
  return out;
}

export async function fetchSocialImages(network: "bluesky" | "mastodon", rawHandle: string) {
  const handle = rawHandle.trim().replace(/^@/, "").toLowerCase();
  try {
    const all = network === "bluesky" ? await bluesky(handle) : await mastodon(handle);
    const images = all.filter((i) => /^https:\/\//.test(i.url) && isAllowedProxyUrl(i.url)).slice(0, 24);
    const skipped = all.length - images.length;
    return { ok: true as const, images, skipped };
  } catch (error) {
    console.warn("[tip-social] fetch failed", network, String(error).slice(0, 80));
    return { ok: false as const, message: "Kon geen openbare foto's ophalen. Controleer de gebruikersnaam." };
  }
}

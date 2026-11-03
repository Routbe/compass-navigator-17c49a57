import { parse } from "yaml";
import { z } from "zod";
import sources from "virtual:rout-docs";
import { canonicalLink, SITE_ORIGIN } from "@/lib/site";

export const DOC_CATEGORIES = ["about", "info", "dev", "safety", "qr-code-generator", "product", "features", "solutions", "compare", "guide", "support"] as const;
export type DocCategory = typeof DOC_CATEGORIES[number];
export const DOC_LABELS: Record<DocCategory, string> = { about: "De missie", info: "ROUT gebruiken", dev: "Developers", safety: "Trust & Safety", "qr-code-generator": "QR-code generator", product: "Product", features: "Mogelijkheden", solutions: "Oplossingen", compare: "Vergelijkingen", guide: "Ontwerp & drukwerk", support: "Account & workspaces" };
const schema = z.object({ title: z.string().min(1), description: z.string().min(1), category: z.enum(DOC_CATEGORIES), last_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ai_ready: z.literal(true), seo_title: z.string().optional(), seo_description: z.string().optional(), seo_keywords: z.array(z.string()).optional(), schema_type: z.enum(["WebApplication", "SoftwareApplication", "HowTo", "Article"]).optional(), qr_type: z.string().optional(), steps: z.array(z.object({ title: z.string(), text: z.string() })).optional(), faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional() });
export type DocEntry = z.infer<typeof schema> & { path: string; source: string; headings: { id: string; text: string; level: number }[] };
export const headingId = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function parseDoc(source: string, file: string): DocEntry {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  if (!match?.[1]) throw new Error(`Missing frontmatter: ${file}`);
  const meta = schema.parse(parse(match[1]));
  const relative = file.replace(/^.*\/content\//, "").replace(/\.mdx$/, "");
  const path = `/${relative.replace(/\/index$/, "")}`;
  if (path !== `/${meta.category}` && !path.startsWith(`/${meta.category}/`)) throw new Error(`Wrong category: ${file}`);
  const seen = new Map<string, number>();
  const body = source.slice(match[0].length).replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
  const headings = [...body.matchAll(/^(#{2,3}) (.+)$/gm)].map(m => {
    const text = (m[2] ?? "").replace(/[`*_]/g, "");
    const base = headingId(text); const count = seen.get(base) ?? 0; seen.set(base, count + 1);
    return { id: count ? `${base}-${count}` : base, text, level: m[1]?.length ?? 2 };
  });
  return { ...meta, path, source, headings };
}
export const docs = Object.entries(sources).map(([file, source]) => parseDoc(source, file));
export function getDoc(path: string) { return docs.find(d => d.path === path); }
const articleOrder: Partial<Record<DocCategory, string[]>> = {
  about: ["index", "manifesto", "anonymous-questions", "responsible-ai", "ecosystem", "sovereignty", "open-source", "brand"],
  info: ["index", "profiles", "anonymous-questions", "answers-and-stories", "ghost-mode", "usernames", "badges", "custom-badges", "credentials", "qr-studio", "wallet", "account-security", "account-merge"],
  dev: ["index", "get-started", "identity-oidc", "identity", "credentials-api", "credentials", "webhooks", "ai-mcp", "design-system"],
  safety: ["index", "anonymous-questions", "architecture", "cryptography", "zero-knowledge", "compliance", "transparency", "privacy", "terms", "data-deletion", "security-advisories"],
};
export function docsInCategory(category: DocCategory) {
  const rank = (doc: DocEntry) => { const slug = doc.path === `/${category}` ? "index" : doc.path.split("/").at(-1) ?? ""; const position = (articleOrder[category] ?? ["index"]).indexOf(slug); return position < 0 ? Number.MAX_SAFE_INTEGER : position; };
  return docs.filter(d => d.category === category).sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}
export function docHead(path: string) {
  const doc = getDoc(path);
  const title = doc?.seo_title ?? `${doc?.title ?? "Documentatie"} — ROUT`;
  const description = doc?.seo_description ?? doc?.description ?? "ROUT-documentatie";
  return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "article" }, { property: "og:url", content: `${SITE_ORIGIN}${path}` }, { name: "twitter:card", content: "summary" }, ...(doc?.seo_keywords ? [{ name: "keywords", content: doc.seo_keywords.join(", ") }] : [])], links: [canonicalLink(path)], scripts: doc ? [{ type: "application/ld+json", children: JSON.stringify(docStructuredData(doc)).replace(/</g, "\\u003c") }] : [] };
}

export function docStructuredData(doc: DocEntry) {
  const url = `${SITE_ORIGIN}${doc.path}`;
  const primary: Record<string, unknown> = { "@type": doc.schema_type ?? "Article", "@id": `${url}#article`, name: doc.title, description: doc.description, url, inLanguage: "nl", dateModified: doc.last_updated, publisher: { "@type": "Organization", name: "ROUT", url: SITE_ORIGIN } };
  if (doc.schema_type === "HowTo") primary.step = (doc.steps ?? []).map((step, index) => ({ "@type": "HowToStep", position: index + 1, name: step.title, text: step.text, url: `${url}#stap-${index + 1}` }));
  if (doc.schema_type === "WebApplication" || doc.schema_type === "SoftwareApplication") Object.assign(primary, { applicationCategory: "UtilitiesApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", description: "Lokale statische QR-generatie" } });
  const graph: Record<string, unknown>[] = [primary];
  if (doc.faqs?.length) graph.push({ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: doc.faqs.map(faq => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) });
  return { "@context": "https://schema.org", "@graph": graph };
}
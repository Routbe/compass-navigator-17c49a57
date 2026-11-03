import { createFileRoute } from "@tanstack/react-router";
import { getPublicFeedback } from "@/lib/feedback.functions";
import { FeedbackPage } from "@/components/profile/FeedbackPage";
export const Route = createFileRoute("/w/$slug_/feedback")({
  loader: ({ params }) => getPublicFeedback({ data: { space: "workspace", handle: params.slug } }),
  head: ({ params }) => ({ meta: [{ title: `Workspacefeedback · ${params.slug} | ROUT` }, { name: "description", content: "Deel je ervaring met deze ROUT-workspace." }, { property: "og:title", content: `Workspacefeedback · ${params.slug} | ROUT` }, { property: "og:description", content: "Beoordelingen en reacties voor deze workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <FeedbackPage items={Route.useLoaderData()} />,
});
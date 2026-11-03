import { createFileRoute } from "@tanstack/react-router";
import { getPublicFeedback } from "@/lib/feedback.functions";
import { FeedbackPage } from "@/components/profile/FeedbackPage";
export const Route = createFileRoute("/u/$username_/feedback")({
  loader: ({ params }) => getPublicFeedback({ data: { space: "alias", handle: params.username } }),
  head: ({ params }) => ({ meta: [{ title: `Feedback voor @${params.username} | ROUT` }, { name: "description", content: "Laat je ervaring achter bij dit ROUT-aliasprofiel." }, { property: "og:title", content: `Feedback voor @${params.username} | ROUT` }, { property: "og:description", content: "Beoordelingen en reacties voor dit aliasprofiel." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <FeedbackPage items={Route.useLoaderData()} />,
});
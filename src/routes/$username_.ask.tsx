import { createFileRoute, redirect } from "@tanstack/react-router";
import { getQaPublic } from "@/lib/questions.functions";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { QaAskPage } from "@/components/qa/QaAskPage";
import { qaAskHead } from "@/components/qa/qa-head";

/** Verified profile: full-screen anonymous message page. */
export const Route = createFileRoute("/$username_/ask")({
  loader: async ({ params }) => {
    const handle = sanitizeHandleInput(params.username);
    const { qa } = await getQaPublic({ data: { handle, space: "root" } }).catch(() => ({ qa: null }));
    // Page not activated while the hub block is on: the profile is the place to ask.
    if (qa && !qa.page) throw redirect({ href: `/${handle}${qa.onHub ? "#qna" : ""}`, statusCode: 302 });
    return { handle, qa };
  },
  head: ({ loaderData }) => qaAskHead(loaderData?.handle ?? "", "root"),
  component: RootAsk,
});

function RootAsk() {
  const { handle, qa } = Route.useLoaderData();
  return <QaAskPage handle={handle} space="root" initial={qa} />;
}

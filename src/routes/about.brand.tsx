import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/about/brand")({ head: () => docHead("/about/brand"), component: Page });
function Page() { return <DocPage path="/about/brand" />; }

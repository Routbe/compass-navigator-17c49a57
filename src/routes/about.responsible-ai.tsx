import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/about/responsible-ai")({ head: () => docHead("/about/responsible-ai"), component: Page });
function Page() { return <DocPage path="/about/responsible-ai" />; }
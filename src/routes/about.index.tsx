import { createFileRoute } from "@tanstack/react-router";
import { DocPage } from "@/components/mdx/DocPage";
import { docHead } from "@/lib/docs-catalog";
export const Route = createFileRoute("/about/")({ head: () => docHead("/about"), component: Page });
function Page() { return <DocPage path="/about" />; }

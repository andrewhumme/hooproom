import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { legalHead } from "@/lib/siteContent";
import { getSiteContentServer } from "@/lib/siteContent.functions";

export const Route = createFileRoute("/terms")({
  loader: () => getSiteContentServer({ data: { prefix: "terms." } }),
  head: ({ loaderData }) => legalHead("terms", loaderData),
  component: TermsPage,
});

function TermsPage() {
  return <LegalPage prefix="terms" overrides={Route.useLoaderData()} />;
}

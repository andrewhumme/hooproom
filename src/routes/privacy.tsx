import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { legalHead } from "@/lib/siteContent";
import { getSiteContentServer } from "@/lib/siteContent.functions";

export const Route = createFileRoute("/privacy")({
  loader: () => getSiteContentServer({ data: { prefix: "privacy." } }),
  head: ({ loaderData }) => legalHead("privacy", loaderData),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPage prefix="privacy" overrides={Route.useLoaderData()} />;
}

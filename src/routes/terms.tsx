import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — HoopRoom" },
      { name: "description", content: "HoopRoom terms of service and usage guidelines." },
      { property: "og:title", content: "Terms of Service — HoopRoom" },
      { property: "og:description", content: "HoopRoom terms of service and usage guidelines." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="flex-1 px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-black tracking-tight">Terms of Service</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: August 7, 2026</p>

        <section className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Welcome to HoopRoom. These Terms of Service outline the basic rules for using our platform. By creating an account or joining a draft room, you agree to these terms.
          </p>

          <h2 className="text-lg font-bold text-foreground">Use of the Platform</h2>
          <p>
            HoopRoom is a fantasy basketball draft tool. You may use the platform to create, join, and manage draft rooms. You are responsible for any activity that happens under your account.
          </p>

          <h2 className="text-lg font-bold text-foreground">User Conduct</h2>
          <p>
            Please be respectful in draft rooms and public areas. Do not use HoopRoom to harass others, share harmful content, or attempt to disrupt the service.
          </p>

          <h2 className="text-lg font-bold text-foreground">Accounts & Data</h2>
          <p>
            We may suspend or terminate accounts that violate these terms or abuse the platform. We reserve the right to remove content or data that we determine is inappropriate.
          </p>

          <h2 className="text-lg font-bold text-foreground">Limitations</h2>
          <p>
            HoopRoom is provided as-is. We do not guarantee that the platform will always be available, error-free, or suitable for every league's specific rules. Draft results and stats are for entertainment and preparation purposes.
          </p>

          <h2 className="text-lg font-bold text-foreground">Changes to These Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of HoopRoom after changes means you accept the updated terms.
          </p>

          <h2 className="text-lg font-bold text-foreground">Contact</h2>
          <p>Questions about these terms? Reach out through your HoopRoom account settings.</p>
        </section>
      </div>
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — HoopRoom" },
      { name: "description", content: "HoopRoom privacy policy and data practices." },
      { property: "og:title", content: "Privacy Policy — HoopRoom" },
      { property: "og:description", content: "HoopRoom privacy policy and data practices." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="flex-1 px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-black tracking-tight">Privacy Policy</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: August 7, 2026</p>

        <section className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            This Privacy Policy describes how HoopRoom handles your information. By using the platform, you agree to the practices described here.
          </p>

          <h2 className="text-lg font-bold text-foreground">Information We Collect</h2>
          <p>
            We collect basic account information (such as your email address and display name) and data related to your use of HoopRoom, including draft rooms you create or join.
          </p>

          <h2 className="text-lg font-bold text-foreground">How We Use Information</h2>
          <p>
            We use your information to operate the platform, provide draft features, send optional notifications, and improve the service. We do not sell your personal information.
          </p>

          <h2 className="text-lg font-bold text-foreground">Sharing & Disclosure</h2>
          <p>
            Your draft room activity may be visible to other participants in the same room, depending on the room settings. We may share information with service providers who help us run the platform, or when required by law.
          </p>

          <h2 className="text-lg font-bold text-foreground">Cookies & Analytics</h2>
          <p>
            We may use cookies and similar technologies to keep you signed in and understand how the platform is used. You can manage cookie preferences through your browser settings.
          </p>

          <h2 className="text-lg font-bold text-foreground">Data Retention</h2>
          <p>
            We keep your information for as long as your account is active or as needed to provide the service. You may request deletion of your account by contacting us.
          </p>

          <h2 className="text-lg font-bold text-foreground">Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy occasionally. We will notify users of significant changes by posting the new policy on this page.
          </p>

          <h2 className="text-lg font-bold text-foreground">Contact</h2>
          <p>For privacy-related questions, please reach out through your HoopRoom account settings.</p>
        </section>
      </div>
    </main>
  );
}

import { MiniMarkdown } from "@/components/MiniMarkdown";
import { contentReader, type ContentMap } from "@/lib/siteContent";

/** Terms / Privacy layout; copy is editable in Admin Tools → Site content. */
export function LegalPage({ prefix, overrides }: { prefix: "terms" | "privacy"; overrides: ContentMap }) {
  const c = contentReader(overrides);
  return (
    <main className="flex-1 px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-black tracking-tight">{c(`${prefix}.title`)}</h1>
        <p className="mt-4 text-sm text-muted-foreground">{c(`${prefix}.updated`)}</p>
        <MiniMarkdown
          source={c(`${prefix}.body`)}
          className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground"
        />
      </div>
    </main>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Eye, ExternalLink, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MiniMarkdown } from "@/components/MiniMarkdown";
import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin } from "@/lib/admin.functions";
import { SITE_CONTENT, type ContentField } from "@/lib/siteContent";

export const Route = createFileRoute("/_authenticated/admin/content")({
  component: SiteContentEditor,
  head: () => ({ meta: [{ title: "Site content — HoopRoom Admin" }] }),
});

const PAGES = [...new Set(SITE_CONTENT.map((f) => f.page))];

function SiteContentEditor() {
  const isAdminFn = useServerFn(checkIsAdmin);
  const [status, setStatus] = useState<"loading" | "denied" | "ready">("loading");
  // Saved overrides from the database, and the editor's working copy.
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [page, setPage] = useState<ContentField["page"]>(PAGES[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { isAdmin } = await isAdminFn();
        if (!isAdmin) return setStatus("denied");
        const { data, error } = await supabase.from("site_content").select("key, value");
        if (error) throw new Error(error.message);
        const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
        setSaved(map);
        setStatus("ready");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        setStatus("denied");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fields start filled with their current text (custom or built-in) so
  // edits happen in place. Text that is empty or identical to the built-in
  // default is stored as "no override".
  const valueOf = (f: ContentField) => draft[f.key] ?? saved[f.key] ?? f.default;
  const overrideOf = (f: ContentField) => {
    const v = valueOf(f);
    return !v.trim() || v === f.default ? "" : v;
  };
  const effective = (f: ContentField) => overrideOf(f) || f.default;
  const isDirty = (f: ContentField) => overrideOf(f) !== (saved[f.key] ?? "");
  const dirtyFields = useMemo(() => SITE_CONTENT.filter(isDirty), [draft, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    const out = new Map<string, ContentField[]>();
    for (const f of SITE_CONTENT.filter((x) => x.page === page)) {
      out.set(f.section, [...(out.get(f.section) ?? []), f]);
    }
    return [...out.entries()];
  }, [page]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      // Text matching the built-in default is stored as "no override", so a
      // later change to the default still takes effect.
      const toUpsert = dirtyFields
        .filter((f) => overrideOf(f))
        .map((f) => ({
          key: f.key,
          value: overrideOf(f),
          updated_at: new Date().toISOString(),
          updated_by: auth.user?.id ?? null,
        }));
      const toDelete = dirtyFields.filter((f) => !overrideOf(f)).map((f) => f.key);
      if (toUpsert.length) {
        const { error } = await supabase.from("site_content").upsert(toUpsert);
        if (error) throw new Error(error.message);
      }
      if (toDelete.length) {
        const { error } = await supabase.from("site_content").delete().in("key", toDelete);
        if (error) throw new Error(error.message);
      }
      const next = { ...saved };
      for (const r of toUpsert) next[r.key] = r.value;
      for (const k of toDelete) delete next[k];
      setSaved(next);
      setDraft({});
      toast.success(`Saved ${dirtyFields.length} change${dirtyFields.length === 1 ? "" : "s"} — live now`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (status === "denied") {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-black">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">You need admin access to edit site content.</p>
      </main>
    );
  }

  const pagePath = SITE_CONTENT.find((f) => f.page === page)?.path ?? "/";

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link
          to="/admin/users"
          className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Admin tools
        </Link>
        <h1 className="text-3xl font-black tracking-tight">Site content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the wording on HoopRoom's public pages. Saving publishes immediately. Leave a field
          empty (or use Reset) to go back to the built-in text.
        </p>

        <div className="sticky top-0 z-20 -mx-6 mt-6 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
          {PAGES.map((p) => {
            const n = SITE_CONTENT.filter((f) => f.page === p && isDirty(f)).length;
            return (
              <Button
                key={p}
                size="sm"
                variant={p === page ? "default" : "outline"}
                className="font-bold"
                onClick={() => setPage(p)}
              >
                {p}
                {n > 0 && <span className="ml-1 rounded-full bg-background/30 px-1.5 text-[10px]">{n}</span>}
              </Button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" variant="ghost" className="font-bold">
              <a href={pagePath} target="_blank" rel="noreferrer">
                <ExternalLink /> View page
              </a>
            </Button>
            <Button
              size="sm"
              className="font-bold"
              disabled={dirtyFields.length === 0 || saving}
              onClick={save}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {dirtyFields.length ? `Save ${dirtyFields.length} change${dirtyFields.length === 1 ? "" : "s"}` : "Saved"}
            </Button>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {sections.map(([section, fields]) => (
            <Card key={section} className="border-2 p-5">
              <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-primary">{section}</h2>
              <div className="space-y-5">
                {fields.map((f) => (
                  <FieldEditor
                    key={f.key}
                    field={f}
                    value={valueOf(f)}
                    effective={effective(f)}
                    dirty={isDirty(f)}
                    custom={!!overrideOf(f)}
                    onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                    onReset={() => setDraft((d) => ({ ...d, [f.key]: f.default }))}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

function FieldEditor({
  field,
  value,
  effective,
  dirty,
  custom,
  onChange,
  onReset,
}: {
  field: ContentField;
  value: string;
  effective: string;
  dirty: boolean;
  custom: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <label htmlFor={field.key} className="text-sm font-bold">
          {field.label}
        </label>
        {dirty ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-800">
            Unsaved
          </span>
        ) : null}
        {custom ? (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-primary">
            Custom
          </span>
        ) : (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-black uppercase text-muted-foreground">
            Built-in text
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {field.kind === "markdown" && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPreview((p) => !p)}>
              <Eye className="h-3.5 w-3.5" /> {preview ? "Edit" : "Preview"}
            </Button>
          )}
          {custom && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </Button>
          )}
        </div>
      </div>
      {field.kind === "text" ? (
        <Input
          id={field.key}
          value={value}
          placeholder={field.default}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : preview ? (
        <MiniMarkdown
          source={effective}
          className="space-y-3 rounded-md border border-border bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground"
        />
      ) : (
        <Textarea
          id={field.key}
          value={value}
          placeholder={field.default}
          rows={field.kind === "markdown" ? 16 : 3}
          className={field.kind === "markdown" ? "font-mono text-xs" : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.kind === "markdown" && !preview && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Formatting: blank line between paragraphs · <code>## Heading</code> · <code>- bullet</code> ·{" "}
          <code>**bold**</code> · <code>*italic*</code> · <code>[link text](https://…)</code>
        </p>
      )}
    </div>
  );
}

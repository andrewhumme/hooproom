-- Admin-editable site copy (Admin Tools → Site content). One row per
-- overridden field; fields without a row use the default wording built into
-- the app (src/lib/siteContent.ts).
CREATE TABLE IF NOT EXISTS public.site_content (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Site content is public" ON public.site_content;
CREATE POLICY "Site content is public"
  ON public.site_content FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can add site content" ON public.site_content;
CREATE POLICY "Admins can add site content"
  ON public.site_content FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can edit site content" ON public.site_content;
CREATE POLICY "Admins can edit site content"
  ON public.site_content FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can reset site content" ON public.site_content;
CREATE POLICY "Admins can reset site content"
  ON public.site_content FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.site_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_content TO authenticated;
GRANT ALL ON public.site_content TO service_role;

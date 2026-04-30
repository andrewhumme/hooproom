-- Allow longer pick clocks (slow drafts up to 72h = 259200s)
-- pick_clock_sec is smallint (max 32767) so we need to widen the column.
ALTER TABLE public.draft_rooms
  ALTER COLUMN pick_clock_sec TYPE integer;

-- Add draft_format column to support snake (current) and auction (coming soon).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'draft_rooms'
      AND column_name = 'draft_format'
  ) THEN
    ALTER TABLE public.draft_rooms
      ADD COLUMN draft_format text NOT NULL DEFAULT 'snake'
      CHECK (draft_format IN ('snake', 'auction'));
  END IF;
END $$;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS from_year smallint,
  ADD COLUMN IF NOT EXISTS to_year smallint,
  ADD COLUMN IF NOT EXISTS draft_year smallint;

ALTER TABLE public.draft_rooms
  ADD COLUMN IF NOT EXISTS player_pool text NOT NULL DEFAULT 'all';

ALTER TABLE public.draft_rooms
  DROP CONSTRAINT IF EXISTS draft_rooms_player_pool_check;

ALTER TABLE public.draft_rooms
  ADD CONSTRAINT draft_rooms_player_pool_check CHECK (player_pool IN ('all','rookies'));

CREATE INDEX IF NOT EXISTS players_from_year_idx ON public.players (from_year);
CREATE INDEX IF NOT EXISTS players_draft_year_idx ON public.players (draft_year);
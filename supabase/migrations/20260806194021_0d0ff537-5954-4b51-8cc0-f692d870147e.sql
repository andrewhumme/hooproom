ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS draft_round smallint,
  ADD COLUMN IF NOT EXISTS draft_number smallint;
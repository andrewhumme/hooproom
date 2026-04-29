ALTER TABLE public.player_season_stats
  ADD COLUMN IF NOT EXISTS loose_key text
  GENERATED ALWAYS AS (regexp_replace(lower(player_key), '[^a-z0-9]', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS player_season_stats_loose_key_idx
  ON public.player_season_stats(loose_key);

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS loose_key text
  GENERATED ALWAYS AS (regexp_replace(lower(player_key), '[^a-z0-9]', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS players_loose_key_idx
  ON public.players(loose_key);

ALTER TABLE public.player_season_stats
  ADD COLUMN IF NOT EXISTS ts_pct  numeric(4,3),
  ADD COLUMN IF NOT EXISTS usg_pct numeric(4,3),
  ADD COLUMN IF NOT EXISTS ast_pct numeric(4,3),
  ADD COLUMN IF NOT EXISTS tov_pct numeric(4,3),
  ADD COLUMN IF NOT EXISTS pie     numeric(4,3);

ALTER TABLE public.player_season_snapshots
  ADD COLUMN IF NOT EXISTS ts_pct  numeric(4,3),
  ADD COLUMN IF NOT EXISTS usg_pct numeric(4,3),
  ADD COLUMN IF NOT EXISTS ast_pct numeric(4,3),
  ADD COLUMN IF NOT EXISTS tov_pct numeric(4,3),
  ADD COLUMN IF NOT EXISTS pie     numeric(4,3);

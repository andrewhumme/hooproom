-- Weekly snapshots of per-game season averages so the summary page can show
-- how each drafted player has aged across the season.
CREATE TABLE public.player_season_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_key text NOT NULL,
  loose_key text NOT NULL,
  season smallint NOT NULL,
  snapshot_date date NOT NULL,
  team text,
  games_played smallint,
  minutes_per_game numeric,
  pts numeric,
  reb numeric,
  ast numeric,
  stl numeric,
  blk numeric,
  tov numeric,
  fg3_made numeric,
  fg_pct numeric,
  fg3_pct numeric,
  ft_pct numeric,
  ef_fg_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loose_key, season, snapshot_date)
);

GRANT SELECT ON public.player_season_snapshots TO anon, authenticated;
GRANT ALL ON public.player_season_snapshots TO service_role;

ALTER TABLE public.player_season_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read season snapshots"
  ON public.player_season_snapshots
  FOR SELECT
  USING (true);

CREATE INDEX player_season_snapshots_lookup
  ON public.player_season_snapshots (loose_key, season, snapshot_date DESC);

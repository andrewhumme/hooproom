CREATE TABLE public.player_season_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_key text NOT NULL,
  season smallint NOT NULL,
  team text,
  games_played smallint,
  games_started smallint,
  minutes_per_game numeric(4,1),
  pts numeric(5,2),
  reb numeric(5,2),
  ast numeric(5,2),
  stl numeric(4,2),
  blk numeric(4,2),
  tov numeric(4,2),
  oreb numeric(4,2),
  dreb numeric(4,2),
  fg_made numeric(5,2),
  fg_att numeric(5,2),
  fg_pct numeric(4,3),
  fg3_made numeric(4,2),
  fg3_att numeric(5,2),
  fg3_pct numeric(4,3),
  ft_made numeric(4,2),
  ft_att numeric(4,2),
  ft_pct numeric(4,3),
  ef_fg_pct numeric(4,3),
  source text NOT NULL DEFAULT 'nbaapi',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_key, season)
);

CREATE INDEX idx_player_season_stats_player ON public.player_season_stats(player_key);
CREATE INDEX idx_player_season_stats_season ON public.player_season_stats(season);

ALTER TABLE public.player_season_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stats are viewable by everyone"
  ON public.player_season_stats FOR SELECT
  USING (true);

CREATE TRIGGER update_player_season_stats_updated_at
  BEFORE UPDATE ON public.player_season_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
CREATE TABLE public.player_season_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_key text NOT NULL,
  season smallint NOT NULL,
  games_played smallint,
  min numeric(5,2),
  pts numeric(5,2),
  reb numeric(5,2),
  oreb numeric(5,2),
  dreb numeric(5,2),
  ast numeric(5,2),
  stl numeric(5,2),
  blk numeric(5,2),
  turnover numeric(5,2),
  pf numeric(5,2),
  fgm numeric(5,2),
  fga numeric(5,2),
  fg_pct numeric(5,4),
  fg3m numeric(5,2),
  fg3a numeric(5,2),
  fg3_pct numeric(5,4),
  ftm numeric(5,2),
  fta numeric(5,2),
  ft_pct numeric(5,4),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (player_key, season)
);

CREATE INDEX idx_player_season_stats_player_key ON public.player_season_stats(player_key);
CREATE INDEX idx_player_season_stats_season ON public.player_season_stats(season);

ALTER TABLE public.player_season_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Player stats are viewable by everyone"
  ON public.player_season_stats
  FOR SELECT
  USING (true);

CREATE TRIGGER update_player_season_stats_updated_at
  BEFORE UPDATE ON public.player_season_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
-- Players table seeded from balldontlie, used as the canonical pool for drafts.
CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_key TEXT NOT NULL UNIQUE,
  nba_player_id INTEGER UNIQUE,
  bdl_player_id INTEGER UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  position TEXT,
  team_abbreviation TEXT,
  team_full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_active ON public.players (is_active);
CREATE INDEX idx_players_team ON public.players (team_abbreviation);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Player pool is public read for any signed-in user (drafts need it)
CREATE POLICY "Players are viewable by everyone"
ON public.players
FOR SELECT
USING (true);

-- No INSERT/UPDATE/DELETE policies — only service role (server seeding) can write.

CREATE TRIGGER update_players_updated_at
BEFORE UPDATE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
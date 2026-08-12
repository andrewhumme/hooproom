CREATE TABLE public.user_player_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  player_name text NOT NULL,
  player_position text,
  player_team text,
  rank smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, player_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_player_ranks TO authenticated;
GRANT ALL ON public.user_player_ranks TO service_role;

ALTER TABLE public.user_player_ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own big board"
ON public.user_player_ranks
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX user_player_ranks_user_rank_idx ON public.user_player_ranks (user_id, rank);

CREATE TRIGGER user_player_ranks_updated_at
BEFORE UPDATE ON public.user_player_ranks
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
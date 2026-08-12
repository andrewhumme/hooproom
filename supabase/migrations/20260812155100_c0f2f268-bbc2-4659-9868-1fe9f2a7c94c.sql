DROP TABLE IF EXISTS public.user_player_ranks;

CREATE TABLE public.global_player_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id text NOT NULL UNIQUE,
  player_name text NOT NULL,
  player_position text,
  player_team text,
  rank smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.global_player_ranks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_player_ranks TO authenticated;
GRANT ALL ON public.global_player_ranks TO service_role;

ALTER TABLE public.global_player_ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view the global board"
  ON public.global_player_ranks FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert board entries"
  ON public.global_player_ranks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update board entries"
  ON public.global_player_ranks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete board entries"
  ON public.global_player_ranks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX global_player_ranks_rank_idx ON public.global_player_ranks (rank);

CREATE TRIGGER global_player_ranks_updated_at
  BEFORE UPDATE ON public.global_player_ranks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
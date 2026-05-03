
-- Per-user draft queue: players a user wants the system to autopick on expiry.
CREATE TABLE public.draft_queues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL,
  user_id UUID NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_position TEXT,
  player_team TEXT,
  rank SMALLINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id, player_id)
);

CREATE INDEX idx_draft_queues_room_user_rank
  ON public.draft_queues (room_id, user_id, rank);

ALTER TABLE public.draft_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own queue"
  ON public.draft_queues FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert into their own queue"
  ON public.draft_queues FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own queue"
  ON public.draft_queues FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete from their own queue"
  ON public.draft_queues FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER draft_queues_updated_at
  BEFORE UPDATE ON public.draft_queues
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Server-side autopick for snake drafts whose pick_deadline has passed.
-- Mirrors client autopick logic but runs without auth context (pg_cron).
-- For each expired room, computes whose turn it is, picks the highest-ranked
-- player from that user's queue (if any), else falls back to the most-played
-- undrafted player from latest season stats.
CREATE OR REPLACE FUNCTION public.snake_autopick_due()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room public.draft_rooms;
  _round SMALLINT;
  _pick_in_round INT;
  _team_idx SMALLINT;
  _expected_user UUID;
  _reverse BOOLEAN;
  _r SMALLINT;
  _total_picks INT;
  _player_id TEXT;
  _player_name TEXT;
  _player_position TEXT;
  _player_team TEXT;
  _picked INT := 0;
BEGIN
  FOR _room IN
    SELECT * FROM public.draft_rooms
    WHERE status = 'drafting'
      AND draft_format = 'snake'
      AND pick_deadline IS NOT NULL
      AND now() >= pick_deadline
    FOR UPDATE
  LOOP
    _total_picks := _room.team_count * _room.rounds;
    IF _room.current_pick_number > _total_picks THEN CONTINUE; END IF;

    -- Compute (round, team_idx) using reversal rules
    _round := ((_room.current_pick_number - 1) / _room.team_count) + 1;
    _pick_in_round := ((_room.current_pick_number - 1) % _room.team_count) + 1;
    _reverse := false;
    FOR _r IN 1.._round - 1 LOOP
      IF NOT (_r = ANY(_room.reversal_rounds)) THEN
        _reverse := NOT _reverse;
      END IF;
    END LOOP;
    IF _reverse THEN
      _team_idx := _room.team_count - _pick_in_round + 1;
    ELSE
      _team_idx := _pick_in_round;
    END IF;

    SELECT user_id INTO _expected_user
    FROM public.draft_participants
    WHERE room_id = _room.id AND draft_position = _team_idx;

    -- 1) Try the user's queue (skip already-drafted players)
    _player_id := NULL;
    IF _expected_user IS NOT NULL THEN
      SELECT q.player_id, q.player_name, q.player_position, q.player_team
        INTO _player_id, _player_name, _player_position, _player_team
      FROM public.draft_queues q
      WHERE q.room_id = _room.id
        AND q.user_id = _expected_user
        AND NOT EXISTS (
          SELECT 1 FROM public.draft_picks dp
          WHERE dp.room_id = _room.id AND dp.player_id = q.player_id
        )
      ORDER BY q.rank ASC
      LIMIT 1;
    END IF;

    -- 2) Fallback: most-played undrafted player from latest season
    IF _player_id IS NULL THEN
      SELECT
        COALESCE(p.loose_key, p.player_key),
        p.full_name,
        p.position,
        p.team_abbreviation
        INTO _player_id, _player_name, _player_position, _player_team
      FROM public.players p
      LEFT JOIN public.player_season_stats s
        ON s.loose_key = p.loose_key AND s.season = 2025
      WHERE p.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.draft_picks dp
          WHERE dp.room_id = _room.id AND dp.player_id = COALESCE(p.loose_key, p.player_key)
        )
      ORDER BY COALESCE(s.minutes_per_game, 0) DESC NULLS LAST,
               COALESCE(s.pts, 0) DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF _player_id IS NULL THEN CONTINUE; END IF;

    -- Insert the pick
    INSERT INTO public.draft_picks (
      room_id, pick_number, round, team_idx, user_id,
      player_id, player_name, player_position, player_team, was_autopick
    ) VALUES (
      _room.id, _room.current_pick_number, _round, _team_idx, _expected_user,
      _player_id, _player_name, _player_position, _player_team, true
    );

    -- Advance room
    IF _room.current_pick_number >= _total_picks THEN
      UPDATE public.draft_rooms
      SET status = 'complete',
          current_pick_number = _room.current_pick_number + 1,
          pick_deadline = NULL,
          completed_at = now()
      WHERE id = _room.id;
    ELSE
      UPDATE public.draft_rooms
      SET current_pick_number = _room.current_pick_number + 1,
          pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval
      WHERE id = _room.id;
    END IF;

    _picked := _picked + 1;
  END LOOP;

  RETURN _picked;
END;
$$;

-- View-only watch links for drafts, without accounts or anonymous sign-in.
--
-- Every room gets a secret watch_token. /watch/<key> resolves through
-- get_watch_snapshot(), which anyone (including the anon role) may call:
--   * key = room id      → works for listed rooms (public / spectate) only
--   * key = watch_token  → works for any room, including private ones
-- The token is only readable by people who can already see the room row
-- (host + participants for private rooms, per the draft_rooms RLS policy).

ALTER TABLE public.draft_rooms
  ADD COLUMN IF NOT EXISTS watch_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS draft_rooms_watch_token_key
  ON public.draft_rooms(watch_token);

CREATE OR REPLACE FUNCTION public.get_watch_snapshot(_key uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT *
    FROM public.draft_rooms
    WHERE watch_token = _key
       OR (id = _key AND visibility IN ('public', 'spectate'))
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'server_now', now(),
    'room', jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'status', r.status,
      'visibility', r.visibility,
      'draft_format', r.draft_format,
      'draft_mode', r.draft_mode,
      'scoring_format', r.scoring_format,
      'team_count', r.team_count,
      'rounds', r.rounds,
      'reversal_rounds', r.reversal_rounds,
      'current_pick_number', r.current_pick_number,
      'pick_clock_sec', r.pick_clock_sec,
      'pick_deadline', r.pick_deadline,
      'paused_at', r.paused_at,
      'warmup_until', r.warmup_until,
      'scheduled_start_at', r.scheduled_start_at,
      'auto_start_at', r.auto_start_at,
      'auction_budget', r.auction_budget
    ),
    -- No user ids or emails: team names and seat order only.
    'participants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'draft_position', p.draft_position,
        'team_name', p.team_name,
        'is_bot', COALESCE(p.is_bot, false)
      ) ORDER BY p.draft_position NULLS LAST, p.joined_at)
      FROM public.draft_participants p
      WHERE p.room_id = r.id
    ), '[]'::jsonb),
    'picks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'pick_number', dp.pick_number,
        'round', dp.round,
        'team_idx', dp.team_idx,
        'player_id', dp.player_id,
        'player_name', dp.player_name,
        'player_position', dp.player_position,
        'player_team', dp.player_team,
        'auction_price', dp.auction_price,
        'was_keeper', dp.was_keeper,
        'was_autopick', dp.was_autopick
      ) ORDER BY dp.pick_number)
      FROM public.draft_picks dp
      WHERE dp.room_id = r.id
    ), '[]'::jsonb),
    'assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'pick_number', a.pick_number,
        'team_idx', a.team_idx
      ))
      FROM public.draft_pick_assignments a
      WHERE a.room_id = r.id
    ), '[]'::jsonb)
  )
  FROM r;
$$;

REVOKE ALL ON FUNCTION public.get_watch_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_watch_snapshot(uuid) TO anon, authenticated;

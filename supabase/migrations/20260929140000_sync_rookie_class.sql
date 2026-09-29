-- Rookie flags from a draft-class list (sourced from ESPN's draft results by
-- the app) in one call. stats.nba.com, the previous source, stalls requests
-- from servers, so rookie drafts hung while trying to refresh flags.
--
-- _picks: [{ player_key, first_name, last_name, full_name, position,
--            team_abbreviation, team_full_name, draft_round, draft_number }]
-- Players already in the table (matched by loose name key) are flagged and get
-- their draft slot; draftees not yet in the table are added. Everyone else is
-- unflagged. Returns the number of rookies in the class.
CREATE OR REPLACE FUNCTION public.sync_rookie_class(_year integer, _picks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _count integer;
BEGIN
  DROP TABLE IF EXISTS _class;
  CREATE TEMP TABLE _class ON COMMIT DROP AS
  SELECT DISTINCT ON (lk) *
  FROM (
    SELECT p.*, regexp_replace(lower(p.player_key), '[^a-z0-9]', '', 'g') AS lk
    FROM jsonb_to_recordset(_picks) AS p(
      player_key text, first_name text, last_name text, full_name text, position text,
      team_abbreviation text, team_full_name text, draft_round smallint, draft_number smallint
    )
    WHERE p.player_key IS NOT NULL AND p.player_key <> ''
  ) x
  ORDER BY lk, draft_number;

  SELECT count(*) INTO _count FROM _class;
  -- Never wipe the flags on an empty or failed fetch.
  IF _count = 0 THEN RETURN 0; END IF;

  -- Existing players in the class: flag them and record their draft slot.
  UPDATE public.players pl
  SET is_rookie = true,
      is_active = true,
      draft_year = _year,
      draft_round = c.draft_round,
      draft_number = c.draft_number,
      from_year = COALESCE(pl.from_year, _year),
      team_abbreviation = COALESCE(pl.team_abbreviation, c.team_abbreviation),
      team_full_name = COALESCE(pl.team_full_name, c.team_full_name),
      position = COALESCE(pl.position, c.position),
      updated_at = now()
  FROM _class c
  WHERE pl.loose_key = c.lk;

  -- Draftees not in the table yet.
  INSERT INTO public.players (
    player_key, first_name, last_name, full_name, position, team_abbreviation,
    team_full_name, is_active, is_rookie, has_headshot, draft_year, draft_round,
    draft_number, from_year
  )
  SELECT c.player_key, c.first_name, c.last_name, c.full_name, c.position, c.team_abbreviation,
         c.team_full_name, true, true, false, _year, c.draft_round, c.draft_number, _year
  FROM _class c
  WHERE NOT EXISTS (SELECT 1 FROM public.players pl WHERE pl.loose_key = c.lk)
  ON CONFLICT (player_key) DO NOTHING;

  -- Last year's class (and anyone else) is no longer a rookie.
  UPDATE public.players pl
  SET is_rookie = false, updated_at = now()
  WHERE pl.is_rookie
    AND NOT EXISTS (SELECT 1 FROM _class c WHERE c.lk = pl.loose_key);

  RETURN _count;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_rookie_class(integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_rookie_class(integer, jsonb) TO service_role;

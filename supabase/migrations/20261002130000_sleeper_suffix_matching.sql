-- HoopRank's Sleeper import: also link players whose names differ only by a
-- suffix (Jr./Sr./II/III/IV) — e.g. ESPN-sourced rookies like "Mikel Brown Jr."
-- vs Sleeper's "Mikel Brown" — so they get their Sleeper rank instead of
-- sinking to the bottom of rookie drafts. Run "Refresh now" afterwards.

CREATE OR REPLACE FUNCTION public.import_sleeper_ranks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _imp public.external_rank_imports;
  _resp record;
  _ranked integer;
  _matched integer;
BEGIN
  SELECT * INTO _imp FROM public.external_rank_imports
  WHERE source = 'sleeper' AND processed_at IS NULL
  ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'nothing_requested'); END IF;

  SELECT status_code, content, timed_out, error_msg INTO _resp
  FROM net._http_response WHERE id = _imp.request_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pending'); END IF;

  IF _resp.timed_out OR _resp.status_code IS DISTINCT FROM 200 OR _resp.content IS NULL THEN
    UPDATE public.external_rank_imports
    SET processed_at = now(),
        error = COALESCE(_resp.error_msg, 'HTTP ' || COALESCE(_resp.status_code::text, 'timeout'))
    WHERE id = _imp.id;
    RETURN jsonb_build_object('status', 'error', 'error', COALESCE(_resp.error_msg, 'HTTP ' || COALESCE(_resp.status_code::text, 'timeout')));
  END IF;

  CREATE TEMP TABLE _sleeper ON COMMIT DROP AS
  SELECT DISTINCT ON (v->>'search_full_name')
         v->>'search_full_name' AS loose_key,
         (v->>'search_rank')::integer AS source_rank,
         COALESCE(v->>'full_name', trim(concat_ws(' ', v->>'first_name', v->>'last_name'))) AS full_name,
         v->>'team' AS team
  FROM jsonb_each(_resp.content::jsonb) AS e(k, v)
  WHERE (v->>'active')::boolean IS TRUE
    AND v->>'search_rank' IS NOT NULL
    AND COALESCE(v->>'search_full_name', '') <> ''
  ORDER BY v->>'search_full_name', (v->>'search_rank')::integer;

  SELECT count(*) INTO _ranked FROM _sleeper;
  -- Never replace a good ranking with an empty or broken download.
  IF _ranked < 100 THEN
    UPDATE public.external_rank_imports
    SET processed_at = now(), ranked = _ranked, error = 'Too few ranked players in download'
    WHERE id = _imp.id;
    RETURN jsonb_build_object('status', 'error', 'error', 'Too few ranked players', 'ranked', _ranked);
  END IF;

  DELETE FROM public.external_player_ranks WHERE source = 'sleeper';
  INSERT INTO public.external_player_ranks (loose_key, source, source_rank, full_name, team, updated_at)
  SELECT loose_key, 'sleeper', source_rank, full_name, team, now() FROM _sleeper
  ON CONFLICT (loose_key) DO UPDATE
    SET source = EXCLUDED.source, source_rank = EXCLUDED.source_rank,
        full_name = EXCLUDED.full_name, team = EXCLUDED.team, updated_at = now();

  -- Name suffixes differ between sources: ESPN's draft results (where rookies
  -- come from) say "Mikel Brown Jr." while Sleeper says "Mikel Brown" — yet
  -- Sleeper keeps "Jr." for some veterans. Link a HoopRoom player to a Sleeper
  -- rank with the suffix ignored, but only when exactly one Sleeper player
  -- matches, so two different people can't be confused.
  INSERT INTO public.external_player_ranks (loose_key, source, source_rank, full_name, team, updated_at)
  SELECT p.loose_key, 'sleeper', m.source_rank, m.full_name, m.team, now()
  FROM public.players p
  JOIN LATERAL (
    SELECT s.source_rank, s.full_name, s.team, count(*) OVER () AS n
    FROM _sleeper s
    WHERE regexp_replace(s.loose_key, '(jr|sr|ii|iii|iv)$', '')
        = regexp_replace(p.loose_key, '(jr|sr|ii|iii|iv)$', '')
  ) m ON m.n = 1
  WHERE p.is_active
    AND p.loose_key IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM _sleeper s WHERE s.loose_key = p.loose_key)
  ON CONFLICT (loose_key) DO NOTHING;

  SELECT count(*) INTO _matched
  FROM public.external_player_ranks x
  JOIN public.players p ON p.loose_key = x.loose_key AND p.is_active
  WHERE x.source = 'sleeper';

  UPDATE public.external_rank_imports
  SET processed_at = now(), ranked = _ranked, matched = _matched, error = NULL
  WHERE id = _imp.id;

  RETURN jsonb_build_object('status', 'ok', 'ranked', _ranked, 'matched', _matched);
END;
$function$;

REVOKE ALL ON FUNCTION public.import_sleeper_ranks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_sleeper_ranks() TO service_role;

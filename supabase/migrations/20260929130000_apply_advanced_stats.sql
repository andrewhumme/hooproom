-- Apply the advanced-stats refresh (TS%, USG%, AST%, TOV%, PIE) in one call.
-- The app used to issue two UPDATEs per player — hundreds of requests — which
-- exceeds Cloudflare's per-request subrequest limit, so it never completed.
-- Only existing (player_key, season) rows are touched, as before.
CREATE OR REPLACE FUNCTION public.apply_advanced_stats(
  _season integer,
  _snapshot_date date,
  _patches jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _updated integer;
BEGIN
  UPDATE public.player_season_stats s
  SET ts_pct = p.ts_pct,
      usg_pct = p.usg_pct,
      ast_pct = p.ast_pct,
      tov_pct = p.tov_pct,
      pie = p.pie
  FROM jsonb_to_recordset(_patches) AS p(
    player_key text, ts_pct numeric, usg_pct numeric, ast_pct numeric, tov_pct numeric, pie numeric
  )
  WHERE s.player_key = p.player_key AND s.season = _season;
  GET DIAGNOSTICS _updated = ROW_COUNT;

  -- Mirror onto that day's snapshot rows when they exist.
  UPDATE public.player_season_snapshots s
  SET ts_pct = p.ts_pct,
      usg_pct = p.usg_pct,
      ast_pct = p.ast_pct,
      tov_pct = p.tov_pct,
      pie = p.pie
  FROM jsonb_to_recordset(_patches) AS p(
    player_key text, ts_pct numeric, usg_pct numeric, ast_pct numeric, tov_pct numeric, pie numeric
  )
  WHERE s.player_key = p.player_key AND s.season = _season AND s.snapshot_date = _snapshot_date;

  RETURN _updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_advanced_stats(integer, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_advanced_stats(integer, date, jsonb) TO service_role;

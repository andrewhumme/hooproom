CREATE OR REPLACE FUNCTION public.hoop_z_scores(_format text DEFAULT '9-CAT'::text)
RETURNS TABLE(loose_key text, z numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
WITH av AS (
  SELECT s.loose_key AS lk,
         LEAST(1.0, GREATEST(0.5, sqrt(
           SUM(w.wt * LEAST(1.0, COALESCE(s.games_played,0)::numeric / 82))
           / NULLIF(SUM(w.wt),0)
         )))::numeric AS avail
  FROM public.player_season_stats s
  JOIN LATERAL (
    SELECT CASE s.season WHEN 2025 THEN 0.55 WHEN 2024 THEN 0.30 ELSE 0.15 END AS wt
  ) w ON true
  WHERE s.season BETWEEN 2023 AND 2025
    AND s.loose_key IS NOT NULL
    AND s.games_played IS NOT NULL
  GROUP BY s.loose_key
),
q AS (
  SELECT s.loose_key AS lk,
         COALESCE(av.avail, 1.0) AS avail,
         COALESCE(s.pts,0)::numeric * COALESCE(av.avail,1.0) AS pts,
         COALESCE(s.reb,0)::numeric * COALESCE(av.avail,1.0) AS reb,
         COALESCE(s.ast,0)::numeric * COALESCE(av.avail,1.0) AS ast,
         COALESCE(s.stl,0)::numeric * COALESCE(av.avail,1.0) AS stl,
         COALESCE(s.blk,0)::numeric * COALESCE(av.avail,1.0) AS blk,
         COALESCE(s.tov,0)::numeric * COALESCE(av.avail,1.0) AS tov,
         COALESCE(s.fg3_made,0)::numeric * COALESCE(av.avail,1.0) AS fg3m,
         COALESCE(s.fg_pct,0)::numeric AS fg_pct,
         COALESCE(s.fg_att,0)::numeric * COALESCE(av.avail,1.0) AS fg_att,
         COALESCE(s.ft_pct,0)::numeric AS ft_pct,
         COALESCE(s.ft_att,0)::numeric * COALESCE(av.avail,1.0) AS ft_att
  FROM public.player_season_stats s
  LEFT JOIN av ON av.lk = s.loose_key
  WHERE s.season = 2025
    AND s.loose_key IS NOT NULL
    AND (COALESCE(s.games_played,0) >= 20 OR COALESCE(s.minutes_per_game,0) >= 12)
),
a AS (SELECT AVG(fg_pct) AS afg, AVG(ft_pct) AS aft FROM q),
i AS (
  SELECT q.*, (q.fg_pct - a.afg) * q.fg_att AS fgi, (q.ft_pct - a.aft) * q.ft_att AS fti
  FROM q CROSS JOIN a
),
m AS (
  SELECT AVG(pts) mpts, NULLIF(stddev_pop(pts),0) spts,
         AVG(reb) mreb, NULLIF(stddev_pop(reb),0) sreb,
         AVG(ast) mast, NULLIF(stddev_pop(ast),0) sast,
         AVG(stl) mstl, NULLIF(stddev_pop(stl),0) sstl,
         AVG(blk) mblk, NULLIF(stddev_pop(blk),0) sblk,
         AVG(tov) mtov, NULLIF(stddev_pop(tov),0) stov,
         AVG(fg3m) mfg3, NULLIF(stddev_pop(fg3m),0) sfg3,
         AVG(fgi) mfgi, NULLIF(stddev_pop(fgi),0) sfgi,
         AVG(fti) mfti, NULLIF(stddev_pop(fti),0) sfti
  FROM i
)
SELECT i.lk,
  CASE
    WHEN UPPER(COALESCE(_format,'')) LIKE 'PTS%' OR UPPER(COALESCE(_format,'')) = 'POINTS'
      THEN (i.pts - m.mpts) / COALESCE(m.spts,1)
    ELSE
      (i.pts - m.mpts) / COALESCE(m.spts,1)
      + (i.reb - m.mreb) / COALESCE(m.sreb,1)
      + (i.ast - m.mast) / COALESCE(m.sast,1)
      + (i.stl - m.mstl) / COALESCE(m.sstl,1)
      + (i.blk - m.mblk) / COALESCE(m.sblk,1)
      + (i.fg3m - m.mfg3) / COALESCE(m.sfg3,1)
      + (i.fgi - m.mfgi) / COALESCE(m.sfgi,1)
      + (i.fti - m.mfti) / COALESCE(m.sfti,1)
      + CASE WHEN UPPER(COALESCE(_format,'')) LIKE '%8%'
             THEN 0
             ELSE -((i.tov - m.mtov) / COALESCE(m.stov,1)) END
  END AS z
FROM i CROSS JOIN m;
$function$;

GRANT EXECUTE ON FUNCTION public.hoop_z_scores(text) TO postgres;
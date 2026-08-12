CREATE OR REPLACE FUNCTION public.hoop_z_scores(_format text DEFAULT '9-CAT'::text)
 RETURNS TABLE(loose_key text, z numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH av AS (
  SELECT s.loose_key AS lk,
         LEAST(1.0, GREATEST(0.35, power(
           SUM(w.wt * LEAST(1.0, COALESCE(s.games_played,0)::numeric / 82))
           / NULLIF(SUM(w.wt),0)
         , 1.5)))::numeric AS avail
  FROM public.player_season_stats s
  JOIN LATERAL (
    SELECT CASE s.season WHEN 2026 THEN 0.55 WHEN 2025 THEN 0.30 ELSE 0.15 END AS wt
  ) w ON true
  WHERE s.season BETWEEN 2024 AND 2026
    AND s.loose_key IS NOT NULL
    AND s.games_played IS NOT NULL
  GROUP BY s.loose_key
),
base AS (
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
  WHERE s.season = 2026
    AND s.loose_key IS NOT NULL
    AND (COALESCE(s.games_played,0) >= 20 OR COALESCE(s.minutes_per_game,0) >= 12)
),
avgs AS (
  SELECT AVG(fg_pct) AS fg_avg, AVG(ft_pct) AS ft_avg FROM base
),
imp AS (
  SELECT b.lk, b.pts, b.reb, b.ast, b.stl, b.blk, b.tov, b.fg3m,
         (b.fg_pct - a.fg_avg) * b.fg_att AS fgi,
         (b.ft_pct - a.ft_avg) * b.ft_att AS fti
  FROM base b CROSS JOIN avgs a
),
st AS (
  SELECT AVG(pts) mp, COALESCE(NULLIF(stddev_pop(pts),0),1) sp,
         AVG(reb) mr, COALESCE(NULLIF(stddev_pop(reb),0),1) sr,
         AVG(ast) ma, COALESCE(NULLIF(stddev_pop(ast),0),1) sa,
         AVG(stl) ms, COALESCE(NULLIF(stddev_pop(stl),0),1) ss,
         AVG(blk) mb, COALESCE(NULLIF(stddev_pop(blk),0),1) sb,
         AVG(tov) mt, COALESCE(NULLIF(stddev_pop(tov),0),1) stv,
         AVG(fg3m) m3, COALESCE(NULLIF(stddev_pop(fg3m),0),1) s3,
         AVG(fgi) mfg, COALESCE(NULLIF(stddev_pop(fgi),0),1) sfg,
         AVG(fti) mft, COALESCE(NULLIF(stddev_pop(fti),0),1) sft
  FROM imp
)
SELECT i.lk,
  CASE
    WHEN upper(COALESCE(_format,'')) LIKE 'PTS%' OR upper(COALESCE(_format,'')) = 'POINTS'
      THEN (i.pts - st.mp)/st.sp
    WHEN upper(COALESCE(_format,'')) LIKE '%8%'
      THEN (i.pts-st.mp)/st.sp + (i.reb-st.mr)/st.sr + (i.ast-st.ma)/st.sa
         + (i.stl-st.ms)/st.ss + (i.blk-st.mb)/st.sb + (i.fg3m-st.m3)/st.s3
         + (i.fgi-st.mfg)/st.sfg + (i.fti-st.mft)/st.sft
    ELSE (i.pts-st.mp)/st.sp + (i.reb-st.mr)/st.sr + (i.ast-st.ma)/st.sa
       + (i.stl-st.ms)/st.ss + (i.blk-st.mb)/st.sb + (i.fg3m-st.m3)/st.s3
       + (i.fgi-st.mfg)/st.sfg + (i.fti-st.mft)/st.sft - (i.tov-st.mt)/st.stv
  END::numeric AS z
FROM imp i CROSS JOIN st;
$function$;
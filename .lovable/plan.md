# Better Roster Data: Historical Backfill + Advanced Stats

Two independent workstreams. Ship #1 first (immediate value on the draft board), then layer #2 on top of the weekly cron already running.

## 1. Historical backfill — 10 seasons from nbaapi.com

**Goal:** Populate `player_season_stats` with seasons 2015-16 → 2024-25 (10 seasons) so the draft board and player modals can show multi-year trends, career averages, and consistency grades.

**One-time job, no ongoing maintenance.**

### Data
- Source: `api.server.nbaapi.com/api/playertotals?season=YYYY` (already used for current season).
- Regular season only (`isPlayoff !== true`) — same filter as `seasonRefresh.server.ts`.
- Aggregate multi-team rows the same way (prefer `TOT`/`NTM` combined row).
- Upsert on `(player_key, season)` — matches existing unique constraint, so re-runs are idempotent.

### Implementation
- New helper in `src/lib/seasonRefresh.server.ts` (or a sibling `historicalBackfill.server.ts`): `backfillHistoricalSeasons(startSeason, endSeason)`. Reuses the existing `fetchSeason` + `aggregateBySeasonPlayer` + `toPerGameRow` functions — no duplicated logic.
- New admin-only server function `backfillHistoricalStats` in `src/lib/admin.functions.ts` guarded by `requireSupabaseAuth` + `has_role(admin)` check. Runs the 10-season loop, returns per-season row counts. No cron — you trigger it once from the admin page.
- Add a "Backfill historical stats" button to `src/routes/_authenticated/admin.users.tsx` (or a new admin sub-page) with a progress log.

### Draft-board surfacing (light UI touch)
- `PlayerStatsModal.tsx` already shows season rows — the extra seasons will appear automatically once backfilled.
- Add a "3-yr avg" row in the modal header (simple average of the last 3 non-null seasons for PTS/REB/AST/3PM/STL/BLK) so it's visible without scrolling.

## 2. Advanced stats enrichment — NBA CDN weekly cron

**Goal:** Add TS%, USG%, and (optionally) per-36 minute stats to the current season so the draft board can show efficiency and role, not just raw counting stats.

### Data
- Source: `stats.nba.com/stats/leaguedashplayerstats` with `MeasureType=Advanced` (TS%, USG%, PIE, AST%, TOV%, etc.) and `MeasureType=Base&PerMode=Per36` for per-36.
- Free, no auth. Requires a `Referer: https://www.nba.com/` header — otherwise 403.
- One request per measure type per season. Two requests per weekly run.

### Schema
New migration: extend `player_season_stats` with nullable columns:
- `ts_pct numeric(4,3)` — true shooting %
- `usg_pct numeric(4,3)` — usage rate
- `ast_pct numeric(4,3)`
- `tov_pct numeric(4,3)`
- `pie numeric(4,3)` — player impact estimate
- `nba_player_id integer` (already exists on `players` — join key)

Mirror the same columns onto `player_season_snapshots` so weekly rank-movement works for advanced metrics too.

### Implementation
- New helper `refreshAdvancedStats()` in `src/lib/seasonRefresh.server.ts`. Fetches NBA CDN, joins on `nba_player_id` (fallback to `loose_key` matched on player name), upserts the advanced columns onto the existing current-season row (does not create new rows).
- Wire into the existing weekly cron: call `refreshAdvancedStats()` right after `refreshCurrentSeason()` inside `src/routes/api/public/hooks/refresh-season-stats.ts`. One cron job, two data pulls.
- Snapshot: add advanced columns to the snapshot insert so trends work.

### Surfacing
- `PlayerStatsModal.tsx`: add an "Advanced" tab or a small stat row (TS%, USG%, PIE).
- Draft board list (`src/routes/draft.$roomId.tsx` players tab): add a toggle/column for TS% or USG% — helps identify efficient scorers vs. volume shooters at a glance.

## Technical section

### Files touched / created
- `src/lib/seasonRefresh.server.ts` — extract `backfillHistoricalSeasons`, add `refreshAdvancedStats`.
- `src/lib/admin.functions.ts` — new `backfillHistoricalStats` server fn (admin-gated).
- `src/routes/_authenticated/admin.users.tsx` — add backfill trigger button + log output.
- `src/routes/api/public/hooks/refresh-season-stats.ts` — chain the advanced refresh into the weekly run.
- `src/components/PlayerStatsModal.tsx` — surface 3-year avg row + advanced metrics.
- Migration: add advanced columns to `player_season_stats` and `player_season_snapshots`.

### Guardrails
- **Rate limiting:** historical backfill sleeps ~500ms between season fetches (10 seasons × ~5 pages ≈ 50 requests, done in ~30s). NBA CDN calls include the `Referer` header and one retry with backoff on 429.
- **Idempotency:** both jobs use `upsert(..., { onConflict: '...' })` — safe to re-run.
- **RLS unchanged:** stats tables are already public-read via `TO anon`; new columns inherit that policy.

### Not in this plan (deliberately)
- Paid feeds (Sportradar, SportsDataIO) — you already ruled those out for cost/maintenance.
- Backfilling snapshots for past seasons — snapshots are for in-season rank tracking; historical seasons are point-in-time totals.
- Career-arc UI (age curves, similarity scores) — that's a follow-up once the data is in.

### Build order
1. Historical backfill: helper + admin fn + admin UI trigger. Run it once, verify 10 seasons land.
2. Advanced-stats migration + `refreshAdvancedStats` + wire into weekly cron. Manually POST the cron endpoint once to backfill this season.
3. Surface both in `PlayerStatsModal` (3-yr avg row + advanced tab).
4. Optional: TS%/USG% column toggle on the draft board players list.

Steps 1–3 give you the meaningful data improvement. Step 4 is polish.

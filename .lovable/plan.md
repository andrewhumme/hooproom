# HoopRoom Season Report Card

A self-updating post-draft experience that keeps HoopRoom relevant long after draft night. Zero manual upkeep — a weekly cron pulls the latest season stats from `nbaapi.com` (already integrated) and every completed draft room grows a live "how did your picks actually do?" page.

## Why this fits the constraint

- **No content management.** You never write a post, update news, or moderate anything. Stats refresh themselves.
- **Two natural return moments.** Mid-season ("is my draft still holding up?") and end of season ("who won?"). Both are baked into the product, not into your calendar.
- **Leverages what's already built.** Uses the existing `player_season_stats` table, nbaapi.com fetchers, category heatmap logic, and completed-draft summary page.
- **Stays in scope.** No lineups, no waivers, no weekly management — purely a rear-view mirror on the draft itself.

## What users see

### 1. Standings tab on every completed draft summary
A leaderboard of every drafted roster in the room, ranked by 9-cat (or 8-cat) totals using season-to-date per-game averages. Same category math already used in the heatmap, just applied to all rosters. Updates weekly.

### 2. "Your picks, aging" section (My Team tab)
Each of your drafted players gets a mini card:
- Round + pick number (what you paid)
- Season-to-date fantasy value rank among all drafted players in the room
- A simple grade chip: **Steal / Solid / Fair / Reach / Bust** based on how their current rank compares to draft slot
- Sparkline showing rank movement across the season snapshots we've stored

### 3. End-of-season awards (auto-generated, one-time)
When the season ends, one cron run stamps each completed room with:
- **Steal of the Draft** — biggest positive rank-vs-pick delta
- **Biggest Bust** — biggest negative delta
- **Best Overall Team** — top standings finisher
- **Category King** — top team per category

Awards render as a shareable card at the top of the summary page. Perfect social hook to pull the whole draft group back one more time.

### 4. Optional email nudge
One-line opt-in on `/me`: "Email me monthly + when season ends." One monthly digest + one season-end recap. Nothing else. Users who don't opt in still see everything passively when they visit.

## Technical section

### Data pipeline
- New table `player_season_snapshots(player_id, snapshot_date, games_played, per_game_stats jsonb)` — one row per player per weekly pull. Enables sparklines and rank-over-time.
- Existing `fetchPlayerSeasonStats` server fn is reused; a thin wrapper writes both the current-season `player_season_stats` row AND a snapshot row.
- New public cron route: `src/routes/api/public/hooks/refresh-season-stats.ts`. Iterates active-season player IDs in batches (respect nbaapi.com politeness), upserts stats + snapshots.
- `pg_cron` weekly job (Mondays 6am ET) hits the route. Anon-key auth per house convention. Second `pg_cron` job runs once ~April 20 to stamp season awards into a new `draft_room_awards` table.

### Standings + grades (pure derived data, no writes)
- Compute in a `computeRoomStandings` server fn that joins `draft_pick_assignments` → `player_season_stats`. No caching table needed for v1 — completed rooms are small (10 rosters × ~15 players).
- Grade thresholds: percentile rank of the player's current 9-cat value vs. all drafted players in the room, compared to their pick's percentile slot. Reuse the diverging red→amber→green scale already in the heatmap.

### UI surfaces
- `src/routes/draft.$roomId_.summary.tsx` — add "Standings" tab and, on My Team, the aging picks list. Awards banner renders only when `draft_room_awards` row exists.
- `src/routes/_authenticated/me.tsx` — completed-draft cards get a "View report card" CTA and, if awards exist, a small trophy chip.

### RLS
- `player_season_snapshots`: public read via `TO anon` SELECT (stats are public data), writes service-role only.
- `draft_room_awards`: SELECT policy mirrors `can_view_room`; writes service-role only.

### Out of scope for v1
- Email delivery (kept as a follow-up once the passive experience is validated).
- Historical past-seasons comparison.
- Per-week matchup scoring / lineup management (violates project scope).

### Build order
1. Snapshot table + migration + GRANTs + RLS.
2. Weekly refresh cron route + `pg_cron` schedule.
3. `computeRoomStandings` + grades logic (pure functions, unit-testable).
4. Summary page: Standings tab + aging picks section.
5. `draft_room_awards` table + season-end cron + awards banner.
6. `/me` dashboard integration (CTA + trophy chip).

Steps 1–4 alone deliver the mid-season return hook. Steps 5–6 add the end-of-season moment and can ship as a follow-up if you want to validate the passive experience first.

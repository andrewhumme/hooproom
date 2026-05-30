# Keepers + Custom Draft Picks

Add commissioner tools to (a) lock players to specific teams before the draft (Keepers) and (b) reassign individual draft picks to different teams (for pick trades).

## Database

### New table: `room_keepers`
Stores per-room keeper assignments. Created in the lobby, consumed when the draft starts.
- `room_id`, `team_idx`, `player_id`, `player_name`, `player_position`, `player_team`
- `keeper_round` smallint NULL — round the keeper costs that team. `NULL` = no cost (player just removed from pool).
- Unique: `(room_id, player_id)` so a player can't be kept by two teams.
- RLS: commissioner of the room can insert/update/delete; everyone in the draft can read.

### New table: `draft_pick_assignments`
Overrides the default snake team for a specific pick slot. Only stored for picks that have been re-assigned away from their default owner.
- `room_id`, `pick_number` int, `team_idx` smallint
- Unique: `(room_id, pick_number)`
- RLS: commissioner writes; participants read.

### New helper function: `pick_team_for(_room, _pick_number)`
Returns the team_idx that owns a given pick_number for a room. Checks `draft_pick_assignments` first, falls back to snake math (with reversal_rounds applied — same logic currently inlined in `make_pick`).

### Modifications to existing functions
- `make_pick`: replace inline snake math with `pick_team_for()`. No other behavior change.
- `snake_autopick_due`: same swap.
- `start_draft` and `auto_fill_and_start`: after randomizing positions, pre-insert all keepers with a `keeper_round` as `draft_picks` rows at the correct `pick_number` for that team + round. Mark `was_autopick = false` (or add a `was_keeper` flag — see Technical). Advance `current_pick_number` past any keeper picks at the start of the draft. Also exclude all keepered players (cost or no-cost) from the available pool.
- `snake_autopick_due` autopick player search: exclude players in `room_keepers` for that room.

## Lobby UI (commissioner only)

Add two collapsible panels in `src/routes/lobby_.new.tsx` / lobby room view, shown only when `auth.uid() === room.host_user_id` and `status === 'waiting'`:

### Keepers panel
- Per-team accordion (Team 1, Team 2, …)
- Search box → player picker (reuse existing pool query)
- For each kept player: dropdown `Round (1…rounds)` or `No cost`
- Remove button per keeper
- Validation: a team can't have more keepers than rounds; no duplicate players across teams.

### Custom Draft Picks panel
- Grid view: rows = rounds, columns = pick slots (mirrors snake board)
- Each cell shows current owner (default or overridden); click to reassign to any team
- "Reset to default" per pick
- Visual highlight on overridden picks

Both panels lock once `status !== 'waiting'`.

## Draft board display
- `DraftBoardSchematic`: when rendering pick slots pre-draft, use `pick_team_for` data to show traded picks correctly (server returns assignments).
- Show small "K" badge on keeper picks in the board.

## What is NOT in this slice
- No paywall / Pro gating (we'll add `subscription_tier` later).
- No keeper inflation logic (auction keeper cost in $ is out of scope; auction keepers will need their own pass — for v1 keepers apply to snake only).
- No pick-trading UI for players (only commissioner-driven).

## Technical notes

- Snake math for "what pick_number does Team X have in Round R" with reversal_rounds is the inverse of the current loop in `make_pick`. Build it as a SQL helper `team_pick_number(_room, _team_idx, _round)` so keeper insertion is clean.
- Adding a `was_keeper boolean DEFAULT false` column to `draft_picks` is cleaner than overloading `was_autopick`; lets us style keeper rows differently in the board and recap.
- Keep auction format untouched in this migration — return an error if someone tries to add keepers to an auction room (we'll handle auction keepers later).
- All new RPCs use `SECURITY DEFINER` + `auth.uid()` check against `room.host_user_id`, matching the pattern of `add_bot_seat` / `host_start_with_bots`.

## Build order
1. Migration: tables, helper functions, `was_keeper` column, modified `make_pick` / `snake_autopick_due` / `auto_fill_and_start`.
2. Commissioner RPCs: `keeper_upsert`, `keeper_remove`, `pick_assignment_set`, `pick_assignment_reset`.
3. Lobby UI panels + wiring.
4. Draft board badge for keepers + traded picks.
5. Update memory with the new architecture.

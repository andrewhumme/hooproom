## Offline Draft Mode

An in-person alternative to the live multiplayer flow. Host runs the whole draft from one device; other participants only need a link to see their roster.

### 1. Schema additions (one migration)

Extend `draft_rooms`:
- `draft_mode` text default `'online'` — `'online' | 'offline'`
- `layout_preference` text nullable — `'board' | 'console'` (offline only)
- `clock_running` boolean default false, `clock_started_at` timestamptz nullable — for the optional shared timer state (host-controlled, no autopick)

Extend `draft_participants`:
- `owner_email` text nullable
- `share_token` uuid default `gen_random_uuid()` unique — powers per-team read-only URL
- Keep `user_id` nullable (already is) so offline "shadow" participants don't need accounts

New RLS: allow anon `SELECT` on `draft_participants`, `draft_picks`, `draft_pick_assignments` filtered by a `share_token` lookup via a `SECURITY DEFINER` function `get_room_by_share_token(uuid)`. This keeps the existing tight policies for authenticated users untouched.

New RPC `make_offline_pick(room_id, participant_id, player_id, ...)`: `SECURITY DEFINER`, only callable by the room host, advances `current_pick_number`, inserts pick + assignment. Mirrors `make_pick` but bypasses "must be your turn's user_id" check.

New RPC `undo_last_pick(room_id)`: host-only, removes the last pick + assignment, decrements `current_pick_number`. Offline-only quality-of-life.

### 2. Create-room flow (`/lobby/new`)

Add a mode toggle at the top: **Online (multiplayer)** vs **Offline (in person)**.

When Offline is selected:
- Show a **Team list editor**: rows of `{ name, email? }`. `team_count` auto-derives from the list length. Minimum 2, cap at 20. Remove the "invite others" hint.
- Show a **Layout picker**: TV/Big-screen board or Tablet commissioner console.
- Hide fields that don't apply: pick clock stays but is labelled "Optional shared timer — host controls start/pause".
- Persist teams to `draft_participants` at room creation (with `user_id = null`, generated `share_token`, host record uses the actual user).

### 3. Draft room (`/draft/$roomId`)

Detect `draft_mode === 'offline'` early and branch to a dedicated `<OfflineDraftRoom>` component. Two sub-layouts:

**Board layout** (landscape/TV):
- Massive draft board grid (rounds × teams) taking most of the viewport
- Sticky top banner: "On the clock: **[Team name]** — Round X, Pick Y" + optional timer (Start / Pause / Reset)
- Right rail: player search + one-tap "Draft to [Team]" button
- Recent picks ticker along the bottom

**Console layout** (tablet):
- Big "On the clock" card up top with team name + timer
- Player search dominates the middle, single "Draft" button
- Collapsible current roster preview for the on-clock team
- "Undo last pick" always visible

Both layouts share:
- Position-eligibility filter (reuse existing slot logic; disable ineligible players for the current team)
- "Copy roster link" button per team → `/roster/:share_token`
- Timer: purely visual, no autopick; state persisted so it survives refresh

### 4. Read-only team page (`/roster/:token`)

New public route (no auth). Shows:
- Team name + who's on the clock right now + pick number
- Their current roster with slot placement (reuse `assignPicksToSlots`)
- Recent picks ticker
- Realtime updates via existing `draft_picks` channel

No draft actions; no queue in v1 (per answer #4).

### 5. Summary + `/me` compatibility

- `/me` "Hosting" tab labels offline rooms with an **Offline** badge and hides "Waiting for players" progress (it's not applicable).
- Summary page already works from picks/assignments — no changes needed beyond the badge.

### Out of scope for this build

- Emailing owner links (we surface + let host copy them; sending email is a separate turn)
- Owner queues from the read-only page
- Converting an offline room back to online mid-draft

### Technical notes

- All offline write paths go through `SECURITY DEFINER` RPCs → write policies stay locked (matches the pattern already ignored in the security scan).
- No new server functions needed; everything is Supabase RPC + realtime.
- Layout branching is a runtime prop, not a route split, so `/draft/$roomId` remains one URL.

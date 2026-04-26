-- ============================================================
-- DRAFT ROOMS
-- ============================================================
create table public.draft_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  team_count smallint not null check (team_count between 4 and 20),
  rounds smallint not null check (rounds between 1 and 30),
  pick_clock_sec smallint not null check (pick_clock_sec between 15 and 600),
  scoring_format text not null default '9-CAT',
  status text not null default 'waiting' check (status in ('waiting','drafting','complete')),
  current_pick_number integer not null default 0,
  pick_deadline timestamptz,
  league_id uuid, -- nullable; reserved for future league layer
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index draft_rooms_status_idx on public.draft_rooms(status, created_at desc);
create index draft_rooms_host_idx on public.draft_rooms(host_user_id);

alter table public.draft_rooms enable row level security;

create policy "Authed users can view rooms"
on public.draft_rooms for select
to authenticated
using (true);

create policy "Authed users can create rooms"
on public.draft_rooms for insert
to authenticated
with check (auth.uid() = host_user_id);

create policy "Host can update own room"
on public.draft_rooms for update
to authenticated
using (auth.uid() = host_user_id);

create policy "Host can delete waiting room"
on public.draft_rooms for delete
to authenticated
using (auth.uid() = host_user_id and status = 'waiting');

create trigger draft_rooms_updated_at
before update on public.draft_rooms
for each row execute function public.handle_updated_at();

-- ============================================================
-- DRAFT PARTICIPANTS
-- ============================================================
create table public.draft_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draft_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_position smallint, -- assigned at draft start; null while waiting
  team_name text not null default 'Team',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id, user_id),
  unique(room_id, draft_position)
);

create index draft_participants_room_idx on public.draft_participants(room_id);
create index draft_participants_user_idx on public.draft_participants(user_id);

alter table public.draft_participants enable row level security;

create policy "Authed users can view participants"
on public.draft_participants for select
to authenticated
using (true);

create policy "Authed users can join waiting rooms"
on public.draft_participants for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.draft_rooms r
    where r.id = room_id and r.status = 'waiting'
  )
);

create policy "User can update own team name"
on public.draft_participants for update
to authenticated
using (auth.uid() = user_id);

create policy "User can leave waiting room"
on public.draft_participants for delete
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.draft_rooms r
    where r.id = room_id and r.status = 'waiting'
  )
);

create trigger draft_participants_updated_at
before update on public.draft_participants
for each row execute function public.handle_updated_at();

-- ============================================================
-- DRAFT PICKS
-- ============================================================
create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.draft_rooms(id) on delete cascade,
  pick_number integer not null,
  round smallint not null,
  team_idx smallint not null, -- 1..team_count, the slot that picked
  user_id uuid references auth.users(id) on delete set null, -- null if autodrafted empty seat
  player_id text not null, -- balldontlie player id
  player_name text not null,
  player_position text,
  player_team text,
  was_autopick boolean not null default false,
  picked_at timestamptz not null default now(),
  unique(room_id, pick_number),
  unique(room_id, player_id)
);

create index draft_picks_room_idx on public.draft_picks(room_id, pick_number);

alter table public.draft_picks enable row level security;

-- Anyone authed can read picks (drafts are public viewing once started)
create policy "Authed users can view picks"
on public.draft_picks for select
to authenticated
using (true);

-- No direct inserts/updates/deletes; all picks go through make_pick RPC
-- (intentionally no insert/update/delete policies)

-- ============================================================
-- start_draft RPC: host assigns slots and kicks off
-- ============================================================
create or replace function public.start_draft(_room_id uuid)
returns public.draft_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  _room public.draft_rooms;
  _participant_count int;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then
    raise exception 'Room not found';
  end if;
  if _room.host_user_id <> auth.uid() then
    raise exception 'Only the host can start the draft';
  end if;
  if _room.status <> 'waiting' then
    raise exception 'Draft already started';
  end if;

  select count(*) into _participant_count
  from public.draft_participants where room_id = _room_id;

  if _participant_count = 0 then
    raise exception 'Need at least one participant to start';
  end if;

  -- Randomly assign draft positions 1..N among joined participants
  -- Empty seats stay unassigned and will autodraft
  with ordered as (
    select id, row_number() over (order by random()) as pos
    from public.draft_participants
    where room_id = _room_id
  )
  update public.draft_participants p
  set draft_position = o.pos
  from ordered o
  where p.id = o.id;

  update public.draft_rooms
  set status = 'drafting',
      current_pick_number = 1,
      pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval,
      started_at = now()
  where id = _room_id
  returning * into _room;

  return _room;
end;
$$;

grant execute on function public.start_draft(uuid) to authenticated;

-- ============================================================
-- make_pick RPC: validates turn + dedupes + advances state
-- ============================================================
create or replace function public.make_pick(
  _room_id uuid,
  _player_id text,
  _player_name text,
  _player_position text,
  _player_team text,
  _autopick boolean default false
)
returns public.draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  _room public.draft_rooms;
  _round smallint;
  _team_idx smallint;
  _expected_user_id uuid;
  _total_picks int;
  _new_pick public.draft_picks;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then
    raise exception 'Room not found';
  end if;
  if _room.status <> 'drafting' then
    raise exception 'Draft is not active';
  end if;

  _total_picks := _room.team_count * _room.rounds;
  if _room.current_pick_number > _total_picks then
    raise exception 'Draft already complete';
  end if;

  -- Compute round and snake team_idx for current pick
  _round := ((_room.current_pick_number - 1) / _room.team_count) + 1;
  if (_round % 2) = 1 then
    _team_idx := ((_room.current_pick_number - 1) % _room.team_count) + 1;
  else
    _team_idx := _room.team_count - ((_room.current_pick_number - 1) % _room.team_count);
  end if;

  -- Find the user holding this slot (may be null = empty seat)
  select user_id into _expected_user_id
  from public.draft_participants
  where room_id = _room_id and draft_position = _team_idx;

  -- Authorization: either it's an autopick, or the caller is the slot's user,
  -- or the clock has expired (anyone can trigger autopick after deadline)
  if not _autopick then
    if _expected_user_id is null then
      raise exception 'Empty seat — autopick required';
    end if;
    if _expected_user_id <> auth.uid() then
      -- Allow anyone to trigger autopick if clock expired
      if _room.pick_deadline is null or now() < _room.pick_deadline then
        raise exception 'Not your turn';
      end if;
      -- Force autopick flag since caller is not the slot owner
      _autopick := true;
    end if;
  end if;

  -- Dedupe check happens via unique(room_id, player_id) — will raise on conflict
  insert into public.draft_picks (
    room_id, pick_number, round, team_idx, user_id,
    player_id, player_name, player_position, player_team, was_autopick
  ) values (
    _room_id, _room.current_pick_number, _round, _team_idx, _expected_user_id,
    _player_id, _player_name, _player_position, _player_team, _autopick
  )
  returning * into _new_pick;

  -- Advance room state
  if _room.current_pick_number >= _total_picks then
    update public.draft_rooms
    set status = 'complete',
        current_pick_number = _room.current_pick_number + 1,
        pick_deadline = null,
        completed_at = now()
    where id = _room_id;
  else
    update public.draft_rooms
    set current_pick_number = _room.current_pick_number + 1,
        pick_deadline = now() + (_room.pick_clock_sec || ' seconds')::interval
    where id = _room_id;
  end if;

  return _new_pick;
end;
$$;

grant execute on function public.make_pick(uuid, text, text, text, text, boolean) to authenticated;

-- ============================================================
-- Realtime
-- ============================================================
alter publication supabase_realtime add table public.draft_rooms;
alter publication supabase_realtime add table public.draft_participants;
alter publication supabase_realtime add table public.draft_picks;

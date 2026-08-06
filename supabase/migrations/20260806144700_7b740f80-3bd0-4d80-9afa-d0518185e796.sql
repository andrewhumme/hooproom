ALTER TABLE public.room_keepers ADD COLUMN IF NOT EXISTS keeper_price integer;

CREATE OR REPLACE FUNCTION public.keeper_upsert(_room_id uuid, _team_idx smallint, _player_id text, _player_name text, _player_position text, _player_team text, _keeper_round smallint, _keeper_price integer DEFAULT NULL)
 RETURNS room_keepers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _row public.room_keepers;
  _team_keeper_count int;
  _is_auction boolean;
  _total_slots int;
  _other_spend int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id FOR UPDATE;
  IF _room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF _room.host_user_id <> auth.uid() THEN RAISE EXCEPTION 'Only the commissioner can manage keepers'; END IF;
  IF _room.status <> 'waiting' THEN RAISE EXCEPTION 'Keepers can only be set before the draft starts'; END IF;

  _is_auction := _room.draft_format IN ('auction','auction_slow');

  IF NOT _is_auction AND _room.draft_format <> 'snake' THEN
    RAISE EXCEPTION 'Keepers are not supported in this draft format';
  END IF;

  IF _team_idx < 1 OR _team_idx > _room.team_count THEN
    RAISE EXCEPTION 'Invalid team index';
  END IF;

  IF _is_auction THEN
    _total_slots := public.auction_total_slots(_room);
    SELECT count(*) INTO _team_keeper_count
    FROM public.room_keepers
    WHERE room_id = _room_id AND team_idx = _team_idx AND player_id <> _player_id;
    IF _team_keeper_count >= _total_slots THEN
      RAISE EXCEPTION 'Team already has the maximum number of keepers (%)', _total_slots;
    END IF;

    IF _keeper_price IS NULL OR _keeper_price < 0 THEN
      RAISE EXCEPTION 'Keeper price must be $0 or more';
    END IF;

    SELECT coalesce(sum(coalesce(keeper_price,0)),0) INTO _other_spend
    FROM public.room_keepers
    WHERE room_id = _room_id AND team_idx = _team_idx AND player_id <> _player_id;

    -- Must leave at least $1 per remaining roster slot
    IF (_other_spend + _keeper_price) > (_room.auction_budget - (_total_slots - (_team_keeper_count + 1))) THEN
      RAISE EXCEPTION 'Keeper prices exceed this team''s budget';
    END IF;
  ELSE
    IF _keeper_round IS NOT NULL AND (_keeper_round < 1 OR _keeper_round > _room.rounds) THEN
      RAISE EXCEPTION 'Keeper round must be between 1 and %', _room.rounds;
    END IF;

    SELECT count(*) INTO _team_keeper_count
    FROM public.room_keepers
    WHERE room_id = _room_id AND team_idx = _team_idx AND player_id <> _player_id;
    IF _team_keeper_count >= _room.rounds THEN
      RAISE EXCEPTION 'Team already has the maximum number of keepers (%)', _room.rounds;
    END IF;
  END IF;

  INSERT INTO public.room_keepers(
    room_id, team_idx, player_id, player_name, player_position, player_team, keeper_round, keeper_price
  ) VALUES (
    _room_id, _team_idx, _player_id, _player_name, _player_position, _player_team,
    CASE WHEN _is_auction THEN NULL ELSE _keeper_round END,
    CASE WHEN _is_auction THEN _keeper_price ELSE NULL END
  )
  ON CONFLICT (room_id, player_id) DO UPDATE
    SET team_idx = EXCLUDED.team_idx,
        player_name = EXCLUDED.player_name,
        player_position = EXCLUDED.player_position,
        player_team = EXCLUDED.player_team,
        keeper_round = EXCLUDED.keeper_round,
        keeper_price = EXCLUDED.keeper_price,
        updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_auction_keepers(_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _room public.draft_rooms;
  _k record;
  _pick_no int;
  _user_id uuid;
  _team_picks int;
BEGIN
  SELECT * INTO _room FROM public.draft_rooms WHERE id = _room_id;
  IF _room IS NULL OR NOT _room.keepers_enabled THEN RETURN; END IF;
  IF _room.draft_format NOT IN ('auction','auction_slow') THEN RETURN; END IF;

  FOR _k IN
    SELECT * FROM public.room_keepers
    WHERE room_id = _room_id
    ORDER BY team_idx, created_at
  LOOP
    IF EXISTS(SELECT 1 FROM public.draft_picks WHERE room_id = _room_id AND player_id = _k.player_id) THEN
      CONTINUE;
    END IF;

    SELECT user_id INTO _user_id
    FROM public.draft_participants
    WHERE room_id = _room_id AND draft_position = _k.team_idx;

    SELECT coalesce(max(pick_number),0) + 1 INTO _pick_no
    FROM public.draft_picks WHERE room_id = _room_id;

    SELECT count(*) INTO _team_picks FROM public.draft_picks
    WHERE room_id = _room_id AND team_idx = _k.team_idx;

    INSERT INTO public.draft_picks(
      room_id, pick_number, round, team_idx, user_id,
      player_id, player_name, player_position, player_team,
      was_autopick, was_keeper, auction_price
    ) VALUES (
      _room_id, _pick_no, (_team_picks + 1)::smallint, _k.team_idx, _user_id,
      _k.player_id, _k.player_name, _k.player_position, _k.player_team,
      false, true, coalesce(_k.keeper_price, 0)
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auction_start(_room_id uuid)
 RETURNS draft_rooms
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _room public.draft_rooms;
  _participant_count int;
begin
  select * into _room from public.draft_rooms where id = _room_id for update;
  if _room is null then raise exception 'Room not found'; end if;
  if _room.host_user_id <> auth.uid() then raise exception 'Only host can start'; end if;
  if _room.status <> 'waiting' then raise exception 'Draft already started'; end if;
  if _room.draft_format not in ('auction','auction_slow') then
    raise exception 'Not an auction draft';
  end if;

  select count(*) into _participant_count
  from public.draft_participants where room_id = _room_id;
  if _participant_count = 0 then raise exception 'Need at least one participant'; end if;

  with ordered as (
    select id, row_number() over (order by random()) as pos
    from public.draft_participants where room_id = _room_id
  )
  update public.draft_participants p
  set draft_position = o.pos
  from ordered o where p.id = o.id;

  update public.draft_rooms
  set status = 'drafting',
      current_pick_number = 1,
      pick_deadline = null,
      started_at = now()
  where id = _room_id
  returning * into _room;

  perform public.insert_auction_keepers(_room_id);

  return _room;
end;
$function$;
-- Fix off-by-one in snake direction math.
-- Convention: reversal_rounds contains rounds R where the flip going INTO
-- round R is skipped (so R-1 and R are same direction — the "double pick").
-- Previously the check used `if _r = ANY(reversal_rounds)` inside the
-- 1..round-1 walk, which made the no-flip happen between R and R+1 instead
-- of R-1 and R. The fix: check `(_r + 1)` against reversal_rounds.

CREATE OR REPLACE FUNCTION public.snake_default_team(
  _room public.draft_rooms,
  _round smallint,
  _pick_in_round int
) RETURNS smallint
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _reverse boolean := false;
  _r smallint;
BEGIN
  FOR _r IN 1.._round - 1 LOOP
    -- Skip the flip going INTO round (_r + 1) if that round is a reversal round.
    IF NOT ((_r + 1) = ANY(_room.reversal_rounds)) THEN
      _reverse := NOT _reverse;
    END IF;
  END LOOP;
  IF _reverse THEN
    RETURN (_room.team_count - _pick_in_round + 1)::smallint;
  ELSE
    RETURN _pick_in_round::smallint;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_pick_number(
  _room public.draft_rooms,
  _team_idx smallint,
  _round smallint
) RETURNS int
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  _pick_in_round int;
  _candidate int;
  _override_team smallint;
BEGIN
  DECLARE
    _reverse boolean := false;
    _r smallint;
  BEGIN
    FOR _r IN 1.._round - 1 LOOP
      IF NOT ((_r + 1) = ANY(_room.reversal_rounds)) THEN
        _reverse := NOT _reverse;
      END IF;
    END LOOP;
    IF _reverse THEN
      _pick_in_round := _room.team_count - _team_idx + 1;
    ELSE
      _pick_in_round := _team_idx;
    END IF;
  END;
  _candidate := (_round - 1) * _room.team_count + _pick_in_round;

  SELECT team_idx INTO _override_team
  FROM public.draft_pick_assignments
  WHERE room_id = _room.id AND pick_number = _candidate;

  IF _override_team IS NULL OR _override_team = _team_idx THEN
    RETURN _candidate;
  END IF;

  DECLARE
    _scan int;
    _owner smallint;
  BEGIN
    FOR _scan IN ((_round - 1) * _room.team_count + 1)..(_round * _room.team_count) LOOP
      _owner := public.pick_team_for(_room, _scan);
      IF _owner = _team_idx THEN RETURN _scan; END IF;
    END LOOP;
  END;

  RETURN NULL;
END;
$$;

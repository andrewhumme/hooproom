ALTER TABLE public.draft_participants
  DROP CONSTRAINT draft_participants_room_id_draft_position_key;

ALTER TABLE public.draft_participants
  ADD CONSTRAINT draft_participants_room_id_draft_position_key
  UNIQUE (room_id, draft_position) DEFERRABLE INITIALLY DEFERRED;
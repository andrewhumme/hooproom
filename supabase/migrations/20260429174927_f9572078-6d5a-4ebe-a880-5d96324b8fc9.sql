ALTER TABLE public.draft_rooms
  ADD COLUMN slots_pg smallint NOT NULL DEFAULT 1,
  ADD COLUMN slots_sg smallint NOT NULL DEFAULT 1,
  ADD COLUMN slots_sf smallint NOT NULL DEFAULT 1,
  ADD COLUMN slots_pf smallint NOT NULL DEFAULT 1,
  ADD COLUMN slots_c  smallint NOT NULL DEFAULT 1,
  ADD COLUMN slots_flx smallint NOT NULL DEFAULT 3;
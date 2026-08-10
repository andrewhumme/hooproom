-- 1. Rescope email-infrastructure policies to the service_role grantee only
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can manage send log" ON public.email_send_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can manage tokens" ON public.email_unsubscribe_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can manage suppressed emails" ON public.suppressed_emails
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.email_send_log FROM anon, authenticated;
REVOKE ALL ON public.email_send_state FROM anon, authenticated;
REVOKE ALL ON public.email_unsubscribe_tokens FROM anon, authenticated;
REVOKE ALL ON public.suppressed_emails FROM anon, authenticated;
GRANT ALL ON public.email_send_log TO service_role;
GRANT ALL ON public.email_send_state TO service_role;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;
GRANT ALL ON public.suppressed_emails TO service_role;

-- 2. Consistent anonymous spectator read access for public/spectate rooms
CREATE POLICY "Anon can view picks of public rooms" ON public.draft_picks
  FOR SELECT TO anon USING (public.can_view_room(room_id));
CREATE POLICY "Anon can view keepers of public rooms" ON public.room_keepers
  FOR SELECT TO anon USING (public.can_view_room(room_id));
CREATE POLICY "Anon can view pick assignments of public rooms" ON public.draft_pick_assignments
  FOR SELECT TO anon USING (public.can_view_room(room_id));
CREATE POLICY "Anon can view nominations of public rooms" ON public.auction_nominations
  FOR SELECT TO anon USING (public.can_view_room(room_id));
CREATE POLICY "Anon can view bids of public rooms" ON public.auction_bids
  FOR SELECT TO anon USING (public.can_view_room(room_id));

GRANT SELECT ON public.draft_picks TO anon;
GRANT SELECT ON public.room_keepers TO anon;
GRANT SELECT ON public.draft_pick_assignments TO anon;
GRANT SELECT ON public.auction_nominations TO anon;
GRANT SELECT ON public.auction_bids TO anon;
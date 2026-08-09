drop policy if exists "users read own roles" on public.user_roles;

create policy "users read own roles"
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);
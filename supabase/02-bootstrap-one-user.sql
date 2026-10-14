-- ONE-TIME MANUAL BOOTSTRAP. NOT EXECUTED. Requires separate approval.
-- Replace the placeholder only with YOUR VERIFIED EXISTING Supabase auth user ID.
-- Verify that ID against your own existing signed-in session and Supabase Auth > Users.
-- Never identify the target by an email-only lookup. This file intentionally fails
-- until its UUID placeholder is replaced. Run as the SQL Editor postgres role.
begin;
do $$
declare
  target_user_id uuid := 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID';
  affected integer;
begin
  if not exists (
    select 1 from auth.users u join auth.identities i on i.user_id=u.id
    where u.id=target_user_id and u.email_confirmed_at is not null
      and i.provider='google'
      and i.identity_data->>'email_verified'='true'
  ) then raise exception 'Target must be an existing verified Google auth user'; end if;
  update public.profiles set is_superadmin=true where id=target_user_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Expected exactly one existing profile; no bootstrap performed'; end if;
end;
$$;
commit;
-- After replacing the SAME verified UUID, verify only that profile:
-- select id,is_superadmin from public.profiles where id='VERIFIED_UUID'::uuid;

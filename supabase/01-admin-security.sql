-- PROPOSAL ONLY. Requires explicit approval and preflight review. NOT EXECUTED.
-- Existing RLS policies stay enabled and unchanged. No existing records are edited.
begin;
alter table public.profiles add column if not exists is_superadmin boolean not null default false;
-- Abort on unexpected existing column definition or disabled profile RLS.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='profiles' and column_name='is_superadmin' and data_type='boolean' and is_nullable='NO')
    then raise exception 'Unexpected is_superadmin definition; review manually'; end if;
  if not (select relrowsecurity from pg_class where oid='public.profiles'::regclass)
    then raise exception 'Profile RLS must already be enabled'; end if;
end;
$$;
-- Current owner-only SELECT policy limits this read to the user's own row.
grant select (is_superadmin) on public.profiles to authenticated;
revoke insert (is_superadmin), update (is_superadmin) on public.profiles from public,anon,authenticated;
-- Column REVOKE alone cannot override a broad table grant. This trigger provides
-- defense in depth without revoking the existing app's editable profile columns.
-- SECURITY INVOKER is intentional: current_user must remain the actual SQL role.
create or replace function public.protect_sage_superadmin_flag()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (TG_OP='INSERT' and new.is_superadmin is distinct from false)
     or (TG_OP='UPDATE' and new.is_superadmin is distinct from old.is_superadmin) then
    if current_user not in ('postgres','supabase_admin') then
      raise exception 'Only the database administrator may change admin authorization' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_sage_superadmin_flag() from public,anon,authenticated;
create or replace trigger protect_sage_superadmin_flag
before insert or update on public.profiles for each row execute function public.protect_sage_superadmin_flag();

-- Service-role-only RPC. The application authenticates first; the RPC checks the
-- same actor's flag again. It never deletes generations, votes or saved places.
create or replace function public.admin_delete_unreferenced_plan(p_plan_id uuid,p_actor_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.profiles where id=p_actor_id and is_superadmin=true for share;
  if not found then raise exception 'Admin authorization required' using errcode='42501'; end if;
  -- A parent-row FOR UPDATE lock conflicts with FK key-share locks acquired by
  -- concurrent votes/bookmarks. The following statements use fresh READ COMMITTED
  -- snapshots. A concurrent reference either becomes visible or fails its FK check
  -- after this transaction deletes the parent. No accepted reference is cascaded.
  perform 1 from public.plans where id=p_plan_id for update;
  if not found then raise exception 'Recommendation not found' using errcode='P0002'; end if;
  -- Deny on future/unknown referencing tables or custom DELETE triggers.
  if exists (select 1 from pg_catalog.pg_constraint where contype='f'
       and confrelid='public.plans'::regclass
       and not (
         conrelid in ('public.votes'::regclass,'public.saved_places'::regclass)
         and conkey = array[(select attnum from pg_catalog.pg_attribute where attrelid=conrelid and attname='plan_id')]::smallint[]
         and confkey = array[(select attnum from pg_catalog.pg_attribute where attrelid=confrelid and attname='id')]::smallint[]
       ))
     or exists (select 1 from pg_catalog.pg_trigger where tgrelid in ('public.plans'::regclass,'public.votes'::regclass,'public.saved_places'::regclass)
       and not tgisinternal and (tgtype & 8) = 8)
     then raise exception 'Unreviewed deletion dependency' using errcode='23503'; end if;
  if exists (select 1 from public.votes where plan_id=p_plan_id)
     or exists (select 1 from public.saved_places where plan_id=p_plan_id)
     then raise exception 'Recommendation has votes or bookmarks' using errcode='23503'; end if;
  delete from public.plans where id=p_plan_id;
  return true;
end;
$$;
revoke all on function public.admin_delete_unreferenced_plan(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_delete_unreferenced_plan(uuid,uuid) to service_role;
commit;

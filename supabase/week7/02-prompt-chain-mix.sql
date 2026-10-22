-- REVIEW ONLY. Requires 01-domain-tables.sql. Run once as postgres.
-- No initial chains, prompts, models, or weights are inserted.

BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL transaction_timeout = '90s';

-- Serialize configuration changes before statement execution. READ COMMITTED is
-- required so the invariant check sees prior committed configuration changes.
-- The advisory lock key is reserved for this application's Week 7 configuration.
create function public.week7_lock_configuration() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Configuration writes require READ COMMITTED' using errcode='25000';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(77007,1);
  return null;
end $$;

create function public.week7_check_configuration() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists (
    select 1 from public.prompt_chains c where c.mix_weight>0 and (
      not exists (select 1 from public.prompt_chain_steps s where s.chain_id=c.id)
      or exists (select 1 from public.prompt_chain_steps s
        join public.llm_models m on m.id=s.model_id
        join public.llm_providers p on p.id=m.provider_id
        where s.chain_id=c.id and (not m.enabled or not p.enabled))
    )
  ) then
    raise exception 'Active chains require steps and enabled models/providers' using errcode='23514';
  end if;
  return null;
end $$;
revoke all on function public.week7_lock_configuration() from public,anon,authenticated,service_role;
revoke all on function public.week7_check_configuration() from public,anon,authenticated,service_role;

do $$ declare t text; begin
  foreach t in array array['llm_providers','llm_models','prompt_chains','prompt_chain_steps'] loop
    execute format('create trigger week7_configuration_lock before insert or update or delete on public.%I for each statement execute function public.week7_lock_configuration()',t);
    execute format('create trigger week7_configuration_check after insert or update or delete on public.%I for each statement execute function public.week7_check_configuration()',t);
  end loop;
end $$;

-- Full-replacement request: every chain must appear exactly once. This detects
-- stale edits AND concurrently added/deleted chains. Weight 0 excludes a chain;
-- all-zero is valid and means no active mix. One UPDATE makes changes atomic.
-- p_changes: [{"id":"uuid","revision":1,"weight":3}, ...]
-- The server must supply p_actor_id from requireAdmin, never from user input,
-- and enforce same-origin + ADMIN_WRITES_ENABLED before calling this RPC.
create function public.admin_update_prompt_chain_mix(p_actor_id uuid,p_changes jsonb)
returns table(chain_id uuid,mix_weight integer,revision integer)
language plpgsql security definer set search_path='' as $$
declare item jsonb; expected_count integer; supplied_count integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Configuration writes require READ COMMITTED' using errcode='25000';
  end if;
  perform 1 from public.profiles p where p.id=p_actor_id and p.is_superadmin=true for share;
  if not found then raise exception 'Admin authorization required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(77007,1);
  if p_changes is null or jsonb_typeof(p_changes)<>'array' then
    raise exception 'Expected a mix array' using errcode='22023';
  end if;
  if octet_length(p_changes::text)>262144 or jsonb_array_length(p_changes)>1000 then
    raise exception 'Mix input too large' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(item)<>'object' then
      raise exception 'Invalid mix entry' using errcode='22023';
    end if;
    if (select count(*) from jsonb_object_keys(item))<>3
      or not (item ?& array['id','revision','weight'])
      or jsonb_typeof(item->'id')<>'string'
      or jsonb_typeof(item->'revision')<>'number'
      or jsonb_typeof(item->'weight')<>'number' then
      raise exception 'Invalid mix entry' using errcode='22023';
    end if;
    if (item->>'revision') !~ '^[1-9][0-9]{0,9}$'
      or (item->>'weight') !~ '^(0|[1-9][0-9]{0,4})$' then
      raise exception 'Mix requires integer revisions and weights' using errcode='22023';
    end if;
    if (item->>'revision')::bigint>2147483647 or (item->>'weight')::integer>10000 then
      raise exception 'Mix value out of bounds' using errcode='22023';
    end if;
    -- UUID cast rejects malformed identifiers; API must sanitize SQL errors.
    perform (item->>'id')::uuid;
  end loop;
  supplied_count := jsonb_array_length(p_changes);
  if (select count(distinct (e->>'id')::uuid) from jsonb_array_elements(p_changes) e)<>supplied_count then
    raise exception 'Duplicate chain' using errcode='22023';
  end if;
  select count(*) into expected_count from public.prompt_chains;
  if expected_count<>supplied_count or exists (
    select 1 from jsonb_array_elements(p_changes) e
    left join public.prompt_chains c on c.id=(e->>'id')::uuid
    where c.id is null or c.revision<>(e->>'revision')::integer
  ) then
    raise exception 'Mix changed; reload before saving' using errcode='40001';
  end if;
  update public.prompt_chains c set mix_weight=(e->>'weight')::integer
  from jsonb_array_elements(p_changes) e
  where c.id=(e->>'id')::uuid and c.mix_weight<>(e->>'weight')::integer;
  return query select c.id,c.mix_weight,c.revision from public.prompt_chains c order by c.id;
end $$;
revoke all on function public.admin_update_prompt_chain_mix(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_update_prompt_chain_mix(uuid,jsonb) to service_role;
commit;

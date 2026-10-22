-- REVIEW ONLY: apply only after explicit approval. No seed data or existing-table changes.
-- Run once, as postgres, in the documented order. Collisions deliberately abort.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL transaction_timeout = '90s';
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='profiles' and column_name='is_superadmin' and data_type='boolean'
    and is_nullable='NO') then raise exception 'Review profiles.is_superadmin before proceeding'; end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid='public.profiles'::regclass)
    then raise exception 'Existing profiles RLS must be enabled'; end if;
end $$;

create function public.week7_stamp_row() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then
    new.created_at := clock_timestamp(); new.revision := 1;
  else
    if new.id is distinct from old.id then raise exception 'Record identity is immutable' using errcode='23514'; end if;
    new.created_at := old.created_at; new.revision := old.revision+1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.week7_stamp_row() from public,anon,authenticated,service_role;

create table public.llm_providers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=120),
  name text not null check (name=btrim(name) and length(name) between 1 and 120),
  website_url text check (website_url ~ '^https://[^[:space:]]+$' and length(website_url)<=2000),
  enabled boolean not null default true
);
alter table public.llm_providers enable row level security;
revoke all on table public.llm_providers from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.llm_providers
  for each row execute function public.week7_stamp_row();
create index llm_providers_created_idx on public.llm_providers(created_at desc,id);

create table public.llm_models (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  provider_id uuid not null references public.llm_providers(id) on delete restrict,
  model_key text not null check (model_key=btrim(model_key) and length(model_key) between 1 and 200),
  display_name text not null check (display_name=btrim(display_name) and length(display_name) between 1 and 120),
  enabled boolean not null default true,
  unique(provider_id,model_key)
);
alter table public.llm_models enable row level security;
revoke all on table public.llm_models from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.llm_models
  for each row execute function public.week7_stamp_row();
create index llm_models_created_idx on public.llm_models(created_at desc,id);

create table public.prompt_chains (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=120),
  version integer not null check (version>=1),
  name text not null check (name=btrim(name) and length(name) between 1 and 120),
  description text not null check (description=btrim(description) and length(description) between 1 and 2000),
  mix_weight integer not null default 0 check (mix_weight between 0 and 10000),
  unique(slug,version)
);
alter table public.prompt_chains enable row level security;
revoke all on table public.prompt_chains from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.prompt_chains
  for each row execute function public.week7_stamp_row();
create index prompt_chains_created_idx on public.prompt_chains(created_at desc,id);

create table public.prompt_chain_steps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  chain_id uuid not null references public.prompt_chains(id) on delete restrict,
  position integer not null check (position>=1),
  name text not null check (name=btrim(name) and length(name) between 1 and 120),
  instruction text not null check (instruction=btrim(instruction) and length(instruction) between 1 and 20000),
  model_id uuid not null references public.llm_models(id) on delete restrict,
  unique(chain_id,position)
);
alter table public.prompt_chain_steps enable row level security;
revoke all on table public.prompt_chain_steps from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.prompt_chain_steps
  for each row execute function public.week7_stamp_row();
create index prompt_chain_steps_created_idx on public.prompt_chain_steps(created_at desc,id);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  term text not null check (term=btrim(term) and length(term) between 1 and 120),
  definition text not null check (definition=btrim(definition) and length(definition) between 1 and 5000)
);
alter table public.terms enable row level security;
revoke all on table public.terms from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.terms
  for each row execute function public.week7_stamp_row();
create index terms_created_idx on public.terms(created_at desc,id);

create table public.llm_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  generation_id uuid references public.generations(id) on delete set null,
  provider_key text not null check (provider_key=btrim(provider_key) and length(provider_key) between 1 and 120),
  model_key text not null check (model_key=btrim(model_key) and length(model_key) between 1 and 200),
  response_text text not null check (length(btrim(response_text))>0 and octet_length(response_text)<=262144),
  source_reference text not null check (source_reference=btrim(source_reference) and length(source_reference) between 1 and 2000),
  captured_at timestamptz not null,
  imported_by uuid references public.profiles(id) on delete set null
);
alter table public.llm_responses enable row level security;
revoke all on table public.llm_responses from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.llm_responses
  for each row execute function public.week7_stamp_row();
create index llm_responses_created_idx on public.llm_responses(created_at desc,id);

create table public.ai_generation_examples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  title text not null check (title=btrim(title) and length(title) between 1 and 160),
  input_text text not null check (length(btrim(input_text))>0 and length(input_text)<=20000),
  output_text text not null check (length(btrim(output_text))>0 and length(output_text)<=20000),
  provenance text not null check (provenance=btrim(provenance) and length(provenance) between 1 and 2000),
  source_response_id uuid references public.llm_responses(id) on delete set null
);
alter table public.ai_generation_examples enable row level security;
revoke all on table public.ai_generation_examples from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.ai_generation_examples
  for each row execute function public.week7_stamp_row();
create index ai_generation_examples_created_idx on public.ai_generation_examples(created_at desc,id);

create table public.allowed_signup_domains (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  domain text not null unique check (
    domain=lower(btrim(domain)) and length(domain)<=253
    and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  enabled boolean not null default true
);
alter table public.allowed_signup_domains enable row level security;
revoke all on table public.allowed_signup_domains from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.allowed_signup_domains
  for each row execute function public.week7_stamp_row();
create index allowed_signup_domains_created_idx on public.allowed_signup_domains(created_at desc,id);

create table public.whitelisted_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  email text not null unique check (email=lower(btrim(email)) and length(email)<=254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  enabled boolean not null default true
);
alter table public.whitelisted_emails enable row level security;
revoke all on table public.whitelisted_emails from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.whitelisted_emails
  for each row execute function public.week7_stamp_row();
create index whitelisted_emails_created_idx on public.whitelisted_emails(created_at desc,id);

create table public.images (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  bucket_id text not null default 'admin-images' check (bucket_id='admin-images'),
  object_path text not null check (object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  title text not null check (title=btrim(title) and length(title) between 1 and 160),
  alt_text text not null default '' check (length(alt_text)<=2000),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  status text not null default 'uploading' check (status in ('uploading','ready','replacing','deleting','error')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  pending_object_path text check (pending_object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  check (width::bigint*height<=40000000),
  check (pending_object_path is null or pending_object_path<>object_path),
  check (status<>'ready' or pending_object_path is null),
  unique(bucket_id,object_path)
);
alter table public.images enable row level security;
revoke all on table public.images from public,anon,authenticated,service_role;
create trigger week7_stamp before insert or update on public.images
  for each row execute function public.week7_stamp_row();
create index images_created_idx on public.images(created_at desc,id);

create unique index terms_name_ci on public.terms(lower(term));
create index prompt_chain_steps_model_id_idx on public.prompt_chain_steps(model_id);
create index llm_responses_generation_id_idx on public.llm_responses(generation_id);
create index llm_responses_imported_by_idx on public.llm_responses(imported_by);
create index ai_generation_examples_source_response_id_idx on public.ai_generation_examples(source_response_id);
create index images_uploaded_by_idx on public.images(uploaded_by);

-- No browser policies: default deny. Server service_role bypasses RLS after requireAdmin.
grant select,insert,update,delete on public.llm_providers to service_role;
grant select,insert,update,delete on public.llm_models to service_role;
grant select on public.prompt_chains to service_role;
grant select on public.prompt_chain_steps to service_role;
grant select,insert,update,delete on public.terms to service_role;
grant select,insert on public.llm_responses to service_role;
grant select,insert,update,delete on public.ai_generation_examples to service_role;
grant select,insert,update,delete on public.allowed_signup_domains to service_role;
grant select,insert,update,delete on public.whitelisted_emails to service_role;
grant select,insert,update,delete on public.images to service_role;

commit;

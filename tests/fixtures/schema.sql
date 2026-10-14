-- Isolated synthetic test schema. Table definitions copied read-only from
-- Hello-World commit 1223b6d78560df1d47fb4e9dde24bc179d0e32aa.
-- This file is ONLY executed inside in-memory PGlite, never Supabase.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
create table auth.identities (user_id uuid references auth.users(id), provider text, identity_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,service_role,anon;
grant execute on function auth.uid() to authenticated;
create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    first_name text,
    last_name text,
    avatar_path text,
    created_at timestamptz not null default now()
);
create table if not exists public.generations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    prompt text not null check (char_length(prompt) between 8 and 1000),
    constraints jsonb not null default '{}'::jsonb,
    provider text not null default 'google-gemini',
    model text not null,
    created_at timestamptz not null default now(),
    constraint generations_id_user_id_key unique (id, user_id)
);
create table if not exists public.plans (
    id uuid primary key default gen_random_uuid(),
    generation_id uuid not null references public.generations (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 100),
    description text not null check (char_length(description) between 1 and 280),
    why_it_fits text not null check (char_length(why_it_fits) between 1 and 350),
    place_id text not null,
    place_name text not null,
    address text,
    rating numeric(2,1) check (rating is null or rating between 0 and 5),
    review_count integer check (review_count is null or review_count >= 0),
    price_level smallint check (price_level is null or price_level between 0 and 4),
    place_url text,
    place_types text[] not null default '{}',
    created_at timestamptz not null default now(),
    constraint plans_generation_owner_fk foreign key (generation_id, user_id)
        references public.generations (id, user_id) on delete cascade
);
create table if not exists public.votes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    plan_id uuid not null references public.plans (id) on delete cascade,
    value smallint not null default 1 check (value in (-1, 1)),
    created_at timestamptz not null default now(),
    constraint votes_one_per_user_per_plan unique (user_id, plan_id)
);
create table public.saved_places (
    user_id uuid not null references auth.users (id) on delete cascade,
    plan_id uuid not null references public.plans (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, plan_id)
);
alter table public.plans add column latitude double precision, add column longitude double precision;
alter table public.profiles enable row level security;
create policy "Users can read their own profile" on public.profiles for select to authenticated using (id=auth.uid());
create policy "Users can update their own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
grant select (id,first_name,last_name,avatar_path,created_at) on public.profiles to authenticated;
grant update (first_name,last_name,avatar_path) on public.profiles to authenticated;
grant all on public.profiles,public.generations,public.plans,public.votes,public.saved_places to service_role;
insert into auth.users values
('11111111-1111-4111-8111-111111111111',now(),'{}'),
('22222222-2222-4222-8222-222222222222',now(),'{}');
insert into auth.identities values
('11111111-1111-4111-8111-111111111111','google','{"email_verified":true}'),
('22222222-2222-4222-8222-222222222222','google','{"email_verified":true}');
insert into public.profiles(id,first_name) select id,'Synthetic fixture' from auth.users;
insert into public.generations(id,user_id,prompt,model) values
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Synthetic test prompt','test-fixture-model');
insert into public.plans(id,generation_id,user_id,title,description,why_it_fits,place_id,place_name) values
('44444444-4444-4444-8444-444444444444','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','TEST ONLY','Synthetic test','Synthetic note','test-place','Synthetic venue');

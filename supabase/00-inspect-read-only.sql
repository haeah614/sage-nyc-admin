-- READ ONLY. Run in Supabase SQL Editor and review results before approving 01.
-- Do not paste any sensitive output into a public issue.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema='public'
and table_name in ('profiles','plans','generations','votes','saved_places')
order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public'
and tablename in ('profiles','plans','generations','votes','saved_places');
select grantee,table_name,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name in ('profiles','plans','generations','votes','saved_places');
select grantee,table_name,column_name,privilege_type from information_schema.column_privileges
where table_schema='public' and table_name='profiles';
select conname,conrelid::regclass as source,confrelid::regclass as target,pg_get_constraintdef(oid)
from pg_constraint where contype='f'
and (conrelid in ('public.plans'::regclass,'public.generations'::regclass,'public.votes'::regclass,'public.saved_places'::regclass)
or confrelid='public.plans'::regclass);
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('profiles','plans','generations','votes','saved_places');
select tgrelid::regclass, tgname, pg_get_triggerdef(oid) from pg_trigger
where not tgisinternal and tgrelid in ('public.profiles'::regclass,'public.plans'::regclass,'public.votes'::regclass,'public.saved_places'::regclass);
-- Review custom SECURITY DEFINER functions for profile writes or arbitrary SQL.
select n.nspname,p.proname,pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and p.prokind='f';

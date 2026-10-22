-- READ-ONLY VERIFICATION ONLY. This file no longer provisions Storage.
-- The former INSERT/CREATE POLICY migration is withdrawn: postgres is not the
-- owner of managed Storage tables. Do not use any saved copy of that migration.
-- Create admin-images via Dashboard/Storage API following
-- docs/week7-storage-provisioning.md, then run this SELECT-only verification.
-- Zero bucket rows means provisioning is still pending, not success.
select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets where id in ('profile-photos','admin-images') order by id;
select c.oid::regclass as relation, pg_get_userbyid(c.relowner) as owner,
       c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
where c.oid in ('storage.buckets'::regclass,'storage.objects'::regclass);
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_catalog.pg_policies
where schemaname='storage' and tablename in ('buckets','objects')
order by tablename,policyname;

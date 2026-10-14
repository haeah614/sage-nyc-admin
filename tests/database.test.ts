import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,beforeEach,afterEach,afterAll,describe,it,expect } from 'vitest';
const admin='11111111-1111-4111-8111-111111111111', member='22222222-2222-4222-8222-222222222222', plan='44444444-4444-4444-8444-444444444444';
let db:PGlite;
const load=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=load('../supabase/01-admin-security.sql');
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(load('./fixtures/schema.sql'));
 await db.exec(migration);
 await db.exec(`update public.profiles set is_superadmin=true where id='${admin}'`);
},30000);
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db.close();});
async function asMember() { await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${member}',true);`); }
async function remove(actor=admin) { return db.query('select public.admin_delete_unreferenced_plan($1,$2) as deleted',[plan,actor]); }
describe('actual PostgreSQL authorization migration on synthetic records',()=>{
 it('defaults ordinary profiles to false',async()=>{const r=await db.query<{is_superadmin:boolean}>('select is_superadmin from public.profiles where id=$1',[member]);expect(r.rows[0].is_superadmin).toBe(false);});
 it('lets a member read only their own admin flag',async()=>{await asMember();const r=await db.query<{id:string;is_superadmin:boolean}>('select id,is_superadmin from public.profiles');expect(r.rows).toEqual([{id:member,is_superadmin:false}]);});
 it('preserves existing editable profile fields',async()=>{await asMember();await db.query('update public.profiles set first_name=$1 where id=$2',['Changed fixture',member]);const r=await db.query<{first_name:string}>('select first_name from public.profiles');expect(r.rows[0].first_name).toBe('Changed fixture');});
 it('denies flag updates through the ordinary column grants',async()=>{await asMember();await expect(db.query('update public.profiles set is_superadmin=true where id=$1',[member])).rejects.toMatchObject({code:'42501'});});
 it('trigger still denies self-promotion if someone accidentally adds a table-wide update grant',async()=>{await db.exec('grant update on public.profiles to authenticated');await asMember();await expect(db.query('update public.profiles set is_superadmin=true where id=$1',[member])).rejects.toMatchObject({code:'42501'});});
 it('trigger denies admin flags on INSERT even with accidental insert grants/policies',async()=>{await db.exec(`grant insert on public.profiles to authenticated; create policy fixture_insert on public.profiles for insert to authenticated with check(true); delete from public.profiles where id='${member}';`);await asMember();await expect(db.query('insert into public.profiles(id,is_superadmin) values($1,true)',[member])).rejects.toMatchObject({code:'42501'});});
 it('does not let the service-role application edit authorization',async()=>{await db.exec('set local role service_role');await expect(db.query('update public.profiles set is_superadmin=true where id=$1',[member])).rejects.toMatchObject({code:'42501'});});
 it('denies anonymous direct RPC execution',async()=>{await db.exec('set local role anon');await expect(remove()).rejects.toMatchObject({code:'42501'});});
 it('denies authenticated direct RPC execution even for an admin profile',async()=>{await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${admin}',true);`);await expect(remove()).rejects.toMatchObject({code:'42501'});});
 it('rechecks the actor flag within service-role deletion',async()=>{await db.exec('set local role service_role');await expect(remove(member)).rejects.toMatchObject({code:'42501'});});
 it('deletes an unreferenced plan and preserves its generation and users',async()=>{await db.exec('set local role service_role');expect((await remove()).rows).toEqual([{deleted:true}]);expect((await db.query('select id from public.plans')).rows).toHaveLength(0);expect((await db.query('select id from public.generations')).rows).toHaveLength(1);expect((await db.query('select id from public.profiles')).rows).toHaveLength(2);});
 it('blocks deletion when votes exist',async()=>{await db.query('insert into public.votes(user_id,plan_id,value) values($1,$2,1)',[member,plan]);await db.exec('set local role service_role');await expect(remove()).rejects.toMatchObject({code:'23503'});});
 it('blocks deletion when bookmarks exist',async()=>{await db.query('insert into public.saved_places(user_id,plan_id) values($1,$2)',[member,plan]);await db.exec('set local role service_role');await expect(remove()).rejects.toMatchObject({code:'23503'});});
 it('fails closed on future referencing tables',async()=>{await db.exec('create table public.future_dependency(plan_id uuid references public.plans(id) on delete cascade)');await db.exec('set local role service_role');await expect(remove()).rejects.toMatchObject({code:'23503'});});
 it('fails closed on unreviewed delete triggers',async()=>{await db.exec(`create function public.fixture_trigger() returns trigger language plpgsql as $$ begin return old; end $$; create trigger fixture_delete before delete on public.plans for each row execute function public.fixture_trigger();`);await db.exec('set local role service_role');await expect(remove()).rejects.toMatchObject({code:'23503'});});
 it('fails closed on a new FK column in an otherwise known child table',async()=>{await db.exec('alter table public.votes add column alternate_plan_id uuid references public.plans(id) on delete cascade');await db.exec('set local role service_role');await expect(remove()).rejects.toMatchObject({code:'23503'});});
 it('blocks custom child DELETE statement triggers, even with no references',async()=>{await db.exec(`create function public.fixture_child_trigger() returns trigger language plpgsql as $$ begin return null; end $$; create trigger fixture_child_delete after delete on public.votes for each statement execute function public.fixture_child_trigger();`);await db.exec('set local role service_role');await expect(remove()).rejects.toMatchObject({code:'23503'});});
 it('reports missing recommendations',async()=>{await db.exec('delete from public.plans; set local role service_role');await expect(remove()).rejects.toMatchObject({code:'P0002'});});
 it('bootstrap changes exactly the verified fixture ID, not other users',async()=>{
   await db.exec('update public.profiles set is_superadmin=false');
   const sql=load('../supabase/02-bootstrap-one-user.sql').replace('REPLACE_WITH_VERIFIED_AUTH_USER_UUID',member).replace(/^begin;$/gm,'').replace(/^commit;$/gm,'');
   await db.exec(sql);const r=await db.query<{id:string}>('select id from public.profiles where is_superadmin=true');expect(r.rows).toEqual([{id:member}]);
 });
 it('bootstrap refuses an account without verified Google identity',async()=>{
   await db.query('delete from auth.identities where user_id=$1',[member]);
   const sql=load('../supabase/02-bootstrap-one-user.sql').replace('REPLACE_WITH_VERIFIED_AUTH_USER_UUID',member).replace(/^begin;$/gm,'').replace(/^commit;$/gm,'');
   await expect(db.exec(sql)).rejects.toThrow('existing verified Google');
 });
});

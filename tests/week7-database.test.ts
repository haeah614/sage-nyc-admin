import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
const load = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const admin = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const generation = '33333333-3333-4333-8333-333333333333';
let db: PGlite;
const files = ['01-domain-tables.sql', '02-prompt-chain-mix.sql'];
const domainTables = ['llm_providers','llm_models','prompt_chains','prompt_chain_steps','terms','llm_responses','ai_generation_examples','allowed_signup_domains','whitelisted_emails','images'];
beforeAll(async () => {
  db = new PGlite();
  await db.exec(load('./fixtures/schema.sql'));
  await db.exec(`
    alter table public.profiles add column is_superadmin boolean not null default false;
    update public.profiles set is_superadmin=true where id='${admin}';
    create table public.movies(id integer primary key,title text);
    insert into public.movies values(1,'Synthetic movie');
    create schema storage;
    create table storage.buckets(id text primary key,name text unique,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null default 'fixture');
    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant all on storage.buckets,storage.objects to anon,authenticated,service_role;
    create policy fixture_profile_upload on storage.objects for insert to authenticated
      with check(bucket_id='profile-photos' and split_part(name,'/',1)=auth.uid()::text);
    insert into storage.buckets values('profile-photos','profile-photos',true,null,null);
    insert into storage.objects(bucket_id) values('profile-photos');
  `);
  // Reproduce the confirmed postgres/public defaults before creating Week 7 objects.
  // This affects only this disposable PGlite database, never live defaults.
  await db.exec(`
    alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant usage on sequences to anon,authenticated,service_role;
    create table public.fixture_default_probe(id integer);
    create function public.fixture_default_probe() returns integer language sql as 'select 1';
  `);
  for (const role of ['anon','authenticated','service_role']) {
    expect((await db.query<{table_access:boolean;function_access:boolean}>(
      "select has_table_privilege($1,'public.fixture_default_probe','SELECT') as table_access, has_function_privilege($1,'public.fixture_default_probe()','EXECUTE') as function_access",[role])).rows[0]).toEqual({table_access:true,function_access:true});
  }
  await db.exec('drop table public.fixture_default_probe; drop function public.fixture_default_probe()');
  const snapshot = await db.query('select row_to_json(p) as row from public.plans p');
  for (const file of files) await db.exec(load(`../supabase/week7/${file}`));
  expect((await db.query('select row_to_json(p) as row from public.plans p')).rows).toEqual(snapshot.rows);
  // SQL migrations work without a bucket; these are synthetic fixtures standing
  // in for later Dashboard/API provisioning, not production Storage SQL.
  expect((await db.query("select id from storage.buckets where id='admin-images'")).rows).toEqual([]);
  await db.exec("insert into storage.buckets values('admin-images','admin-images',false,5242880,array['image/jpeg','image/png','image/webp'])");
}, 30000);
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db.close(); });
async function setupChain() {
  const provider = (await db.query<{id:string}>("insert into public.llm_providers(slug,name) values('fixture','Fixture') returning id")).rows[0].id;
  const model = (await db.query<{id:string}>('insert into public.llm_models(provider_id,model_key,display_name) values($1,\'fixture\',\'Fixture\') returning id',[provider])).rows[0].id;
  const chain = (await db.query<{id:string}>("insert into public.prompt_chains(slug,version,name,description) values('fixture',1,'Fixture','Synthetic configuration') returning id")).rows[0].id;
  await db.query('insert into public.prompt_chain_steps(chain_id,position,name,instruction,model_id) values($1,1,\'Fixture\',\'Synthetic instruction\',$2)',[chain,model]);
  return {provider,model,chain};
}
const mix = (chain: string, revision = 1, weight = 3, actor = admin) => db.query('select * from public.admin_update_prompt_chain_mix($1,$2::jsonb)', [actor,JSON.stringify([{id:chain,revision,weight}])]);
describe('Week 7 actual migrations on disposable PostgreSQL', () => {
  it('creates ten RLS tables without changing existing records', async () => {
    const r = await db.query<{relname:string;relrowsecurity:boolean}>('select relname,relrowsecurity from pg_class where relnamespace=\'public\'::regnamespace and relname=any($1)',[domainTables]);
    expect(r.rows).toHaveLength(10); expect(r.rows.every(x=>x.relrowsecurity)).toBe(true);
    expect((await db.query('select id from public.profiles')).rows).toHaveLength(2);
    expect((await db.query('select id from public.generations')).rows).toHaveLength(1);
    expect((await db.query('select id from public.movies')).rows).toEqual([{id:1}]);
  });
  it.each(['anon','authenticated'])('denies %s every new table and the mix RPC', async role => {
    for (const table of domainTables) {
      const r=await db.query<{read:boolean;write:boolean}>('select has_table_privilege($1,$2,\'SELECT\') as read,has_table_privilege($1,$2,\'INSERT,UPDATE,DELETE\') as write',[role,`public.${table}`]);
      expect(r.rows[0]).toEqual({read:false,write:false});
    }
    await db.exec(`set local role ${role}`);
    await expect(db.query('select * from public.admin_update_prompt_chain_mix($1,\'[]\')',[admin])).rejects.toMatchObject({code:'42501'});
  });
  it('neutralizes broad table defaults and grants only the exact runtime operations', async () => {
    for (const table of domainTables) {
      const expected=['prompt_chains','prompt_chain_steps'].includes(table)?['SELECT']:
        table==='llm_responses'?['INSERT','SELECT']:['DELETE','INSERT','SELECT','UPDATE'];
      const grants=await db.query<{privilege_type:string;is_grantable:boolean}>(`
        select a.privilege_type,a.is_grantable from pg_class c
        cross join lateral aclexplode(c.relacl) a
        where c.oid=$1::regclass and a.grantee='service_role'::regrole
        order by a.privilege_type`,[`public.${table}`]);
      expect(grants.rows).toEqual(expected.map(privilege_type=>({privilege_type,is_grantable:false})));
      const browser=await db.query(`select a.* from pg_class c
        cross join lateral aclexplode(c.relacl) a where c.oid=$1::regclass
        and a.grantee in (0,'anon'::regrole,'authenticated'::regrole)`,[`public.${table}`]);
      expect(browser.rows).toEqual([]);
      for (const role of ['anon','authenticated']) {
        for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) {
          expect((await db.query<{allowed:boolean}>('select has_table_privilege($1,$2,$3) as allowed',[role,`public.${table}`,privilege])).rows[0].allowed).toBe(false);
        }
      }
    }
  });
  it('revokes every helper signature and exposes only the mix RPC to service_role', async () => {
    const functions=await db.query<{signature:string;prosecdef:boolean;proconfig:string[];owner:string}>(`
      select p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig,
        pg_get_userbyid(p.proowner) as owner from pg_proc p
      where p.pronamespace='public'::regnamespace and
        (p.proname like 'week7_%' or p.proname='admin_update_prompt_chain_mix')
      order by p.proname`);
    expect(functions.rows.map(f=>f.signature)).toEqual([
      'admin_update_prompt_chain_mix(uuid,jsonb)','week7_check_configuration()',
      'week7_lock_configuration()','week7_stamp_row()']);
    for (const f of functions.rows) {
      expect(f.owner).toBe('postgres');
      expect(f.proconfig).toEqual(['search_path=""']);
      expect(f.prosecdef).toBe(f.signature!=='week7_stamp_row()');
      for (const role of ['anon','authenticated','service_role']) {
        const allowed=(await db.query<{allowed:boolean}>("select has_function_privilege($1,$2,'EXECUTE') as allowed",[role,f.signature])).rows[0].allowed;
        expect(allowed).toBe(role==='service_role'&&f.signature.startsWith('admin_update_prompt_chain_mix'));
      }
      expect((await db.query(`select a.* from pg_proc p cross join lateral aclexplode(p.proacl) a
        where p.oid=$1::regprocedure and a.grantee=0`,[f.signature])).rows).toEqual([]);
    }
    expect((await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='S'")).rows).toEqual([]);
  });
  it('keeps runtime chain definitions and response history read-only', async () => {
    for (const table of ['prompt_chains','prompt_chain_steps','llm_responses']) {
      const r=await db.query<{allowed:boolean}>('select has_table_privilege(\'service_role\',$1,\'UPDATE,DELETE\') as allowed',[`public.${table}`]);
      expect(r.rows[0].allowed).toBe(false);
    }
  });
  it('controls timestamps, revision and stale-update detection', async () => {
    await db.exec('set local role service_role');
    const first=(await db.query<{id:string;revision:number;created_at:string}>("insert into public.terms(term,definition,revision,created_at) values('Fixture','First',99,'2000-01-01') returning *")).rows[0];
    expect(first.revision).toBe(1); expect(String(first.created_at)).not.toContain('2000');
    const updated=await db.query<{revision:number;created_at:string}>('update public.terms set definition=\'Second\',revision=999,created_at=\'2000-01-01\' where id=$1 and revision=1 returning revision,created_at',[first.id]);
    expect(updated.rows[0]).toEqual({revision:2,created_at:first.created_at});
    expect((await db.query('update public.terms set definition=\'Stale\' where id=$1 and revision=1 returning id',[first.id])).rows).toEqual([]);
  });
  it('rejects case-insensitive duplicate terms', async () => {
    await db.exec("insert into public.terms(term,definition) values('Cafe','Fixture')");
    await expect(db.exec("insert into public.terms(term,definition) values('cafe','Fixture')")).rejects.toMatchObject({code:'23505'});
  });
  it.each([['allowed_signup_domains','domain','https://example.com'],['whitelisted_emails','email','UPPER@example.com']])('rejects invalid %s values', async (table,column,value) => {
    await expect(db.query(`insert into public.${table}(${column}) values($1)`,[value])).rejects.toMatchObject({code:'23514'});
  });
  it('rechecks the actor and rejects non-admin RPC calls', async () => {
    const {chain}=await setupChain(); await db.exec('set local role service_role');
    await expect(mix(chain,1,3,member)).rejects.toMatchObject({code:'42501'});
  });
  it('saves weights with new revisions and accepts an all-zero mix', async () => {
    const {chain}=await setupChain(); await db.exec('set local role service_role');
    expect((await mix(chain)).rows).toEqual([{chain_id:chain,mix_weight:3,revision:2}]);
    expect((await mix(chain,2,0)).rows).toEqual([{chain_id:chain,mix_weight:0,revision:3}]);
  });
  it('rolls back the entire mix when another chain cannot be activated', async () => {
    const {chain}=await setupChain();
    const empty=(await db.query<{id:string}>("insert into public.prompt_chains(slug,version,name,description) values('empty',1,'Empty','Fixture') returning id")).rows[0].id;
    await db.exec('savepoint attempted_mix');
    await expect(db.query('select * from public.admin_update_prompt_chain_mix($1,$2::jsonb)',[admin,JSON.stringify([{id:chain,revision:1,weight:2},{id:empty,revision:1,weight:1}])])).rejects.toMatchObject({code:'23514'});
    await db.exec('rollback to savepoint attempted_mix');
    expect((await db.query('select mix_weight,revision from public.prompt_chains')).rows).toEqual([{mix_weight:0,revision:1},{mix_weight:0,revision:1}]);
  });
  it('rejects duplicate chain identifiers', async () => {
    const {chain}=await setupChain();
    const entry={id:chain,revision:1,weight:1};
    await expect(db.query('select * from public.admin_update_prompt_chain_mix($1,$2::jsonb)',[admin,JSON.stringify([entry,entry])])).rejects.toMatchObject({code:'22023'});
  });
  it('rejects stale mix edits', async () => {
    const {chain}=await setupChain(); await mix(chain);
    await expect(mix(chain)).rejects.toMatchObject({code:'40001'});
  });
  it('rejects incomplete mix snapshots', async () => {
    await setupChain();
    await expect(db.query('select * from public.admin_update_prompt_chain_mix($1,\'[]\')',[admin])).rejects.toMatchObject({code:'40001'});
  });
  it.each([null,{},[{id:admin,revision:1,weight:-1}],[{id:admin,revision:1,weight:1,extra:true}]])('rejects malformed mix %j', async value => {
    await expect(db.query('select * from public.admin_update_prompt_chain_mix($1,$2::jsonb)',[admin,JSON.stringify(value)])).rejects.toMatchObject({code:'22023'});
  });
  it('rejects an active chain without steps', async () => {
    await expect(db.exec("insert into public.prompt_chains(slug,version,name,description,mix_weight) values('empty',1,'Empty','Fixture',1)")).rejects.toMatchObject({code:'23514'});
  });
  it.each(['llm_models','llm_providers'])('blocks disabling active %s', async table => {
    const {chain}=await setupChain(); await mix(chain); await db.exec('set local role service_role');
    await expect(db.exec(`update public.${table} set enabled=false`)).rejects.toMatchObject({code:'23514'});
  });
  it('blocks removal of the final step of an active chain', async () => {
    const {chain}=await setupChain(); await mix(chain);
    await expect(db.exec('delete from public.prompt_chain_steps')).rejects.toMatchObject({code:'23514'});
  });
  it('allows model deactivation once the mix excludes the chain', async () => {
    const {chain}=await setupChain(); await mix(chain); await mix(chain,2,0);
    await db.exec('set local role service_role; update public.llm_models set enabled=false');
  });
  it('blocks referenced provider deletion', async () => {
    await setupChain(); await db.exec('set local role service_role');
    await expect(db.exec('delete from public.llm_providers')).rejects.toMatchObject({code:'23001'});
  });
  it('retains genuine-response-shaped synthetic text when its generation is removed', async () => {
    await db.query("insert into public.llm_responses(generation_id,provider_key,model_key,response_text,source_reference,captured_at,imported_by) values($1,'fixture','fixture','Synthetic response','Synthetic fixture',now(),$2)",[generation,admin]);
    await db.query('delete from public.generations where id=$1',[generation]);
    expect((await db.query('select generation_id,response_text from public.llm_responses')).rows).toEqual([{generation_id:null,response_text:'Synthetic response'}]);
  });
  it.each(['profile', 'auth account'])('preserves Week 7 records when deleting the %s', async target => {
    // Synthetic attribution and content. Exercise both direct profile deletion
    // and the complete existing Auth -> profile/generation -> plan cascade.
    const response=(await db.query<{id:string}>("insert into public.llm_responses(generation_id,provider_key,model_key,response_text,source_reference,captured_at,imported_by) values($1,'fixture','fixture','Synthetic response','Synthetic provenance',now(),$2) returning id",[generation,admin])).rows[0].id;
    const objectPath='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
    await db.query("insert into public.images(object_path,title,mime_type,byte_size,width,height,uploaded_by,status) values($1,'Synthetic image','image/png',100,10,10,$2,'ready')",[objectPath,admin]);
    await db.query("insert into public.ai_generation_examples(title,input_text,output_text,provenance,source_response_id) values('Fixture','Input','Output','Synthetic provenance',$1)",[response]);
    const plan='44444444-4444-4444-8444-444444444444';
    await db.query('insert into public.votes(user_id,plan_id,value) values($1,$2,1)',[member,plan]);
    await db.query('insert into public.saved_places(user_id,plan_id) values($1,$2)',[member,plan]);
    const responseBefore=(await db.query<Record<string,unknown>>('select * from public.llm_responses')).rows[0];
    const imageBefore=(await db.query<Record<string,unknown>>('select * from public.images')).rows[0];
    // The shared fixture's simplified auth.identities FK uses NO ACTION.
    // Remove that synthetic identity first: this test covers the confirmed
    // public cascades, not Supabase Auth's internal identity cleanup.
    if (target==='auth account') await db.query('delete from auth.identities where user_id=$1',[admin]);
    await db.query(`delete from ${target==='profile'?'public.profiles':'auth.users'} where id=$1`,[admin]);
    const responseAfter=(await db.query<Record<string,unknown>>('select * from public.llm_responses')).rows[0];
    const imageAfter=(await db.query<Record<string,unknown>>('select * from public.images')).rows[0];
    expect(responseAfter).toEqual({...responseBefore,imported_by:null,generation_id:target==='profile'?generation:null,revision:expect.any(Number),updated_at:expect.anything()});
    expect(Number(responseAfter.revision)).toBeGreaterThan(Number(responseBefore.revision));
    expect(imageAfter).toEqual({...imageBefore,uploaded_by:null,revision:2,updated_at:expect.anything()});
    expect((await db.query('select source_response_id,output_text from public.ai_generation_examples')).rows).toEqual([{source_response_id:response,output_text:'Output'}]);
    expect((await db.query('select id from public.profiles where id=$1',[admin])).rows).toEqual([]);
    expect((await db.query('select id from public.profiles where id=$1',[member])).rows).toEqual([{id:member}]);
    for (const table of ['generations','plans','votes','saved_places']) {
      expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(target==='profile'?1:0);
    }
    expect((await db.query('select id from auth.users where id=$1',[admin])).rows).toHaveLength(target==='profile'?1:0);
    // Runtime can still read the orphaned content without UPDATE grants on responses.
    await db.exec('set local role service_role');
    expect((await db.query('select imported_by from public.llm_responses')).rows).toEqual([{imported_by:null}]);
    expect((await db.query('select uploaded_by from public.images')).rows).toEqual([{uploaded_by:null}]);
  });
  it.each(['anon','authenticated'])('denies %s access to the private bucket under the scoped existing policy', async role => {
    expect((await db.query('select public,file_size_limit,allowed_mime_types from storage.buckets where id=\'admin-images\'')).rows).toEqual([{public:false,file_size_limit:5242880,allowed_mime_types:['image/jpeg','image/png','image/webp']}]);
    await db.exec(`insert into storage.objects(bucket_id) values('admin-images'); set local role ${role}`);
    expect((await db.query("select id from storage.buckets")).rows).toEqual([]);
    expect((await db.query("update storage.buckets set public=true where id='admin-images' returning id")).rows).toEqual([]);
    expect((await db.query("delete from storage.objects where bucket_id='admin-images' returning id")).rows).toEqual([]);
    expect((await db.query('select bucket_id from storage.objects')).rows).toEqual([]);
    if (role==='authenticated') {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[member]);
      await db.query("insert into storage.objects(bucket_id,name) values('profile-photos',$1)",[`${member}/fixture.png`]);
    }
    await expect(db.exec("insert into storage.objects(bucket_id) values('admin-images')")).rejects.toMatchObject({code:'42501'});
  });
  it('keeps the replacement 03 read-only and preserves Storage policies/configuration', async () => {
    const before=await db.query('select * from storage.buckets order by id');
    await db.exec(load('../supabase/week7/03-admin-images-bucket.sql'));
    expect((await db.query('select * from storage.buckets order by id')).rows).toEqual(before.rows);
    expect((await db.query("select policyname from pg_policies where schemaname='storage'")).rows).toEqual([{policyname:'fixture_profile_upload'}]);
  });
  it('allows server-role Storage operations without adding a browser policy', async () => {
    await db.exec('set local role service_role');
    const object=(await db.query<{id:string}>("insert into storage.objects(bucket_id,name) values('admin-images','fixture.png') returning id")).rows[0];
    expect((await db.query("select id from storage.objects where bucket_id='admin-images'")).rows).toEqual([object]);
    await db.query("update storage.objects set name='replacement.png' where id=$1",[object.id]);
    expect((await db.query('delete from storage.objects where id=$1 returning id',[object.id])).rows).toEqual([object]);
  });
  it('prevents images from targeting the existing profile bucket', async () => {
    await expect(db.query("insert into public.images(bucket_id,object_path,title,mime_type,byte_size,width,height,uploaded_by) values('profile-photos',$1,'Fixture','image/png',100,10,10,$2)",[`${admin}/${member}.png`,admin])).rejects.toMatchObject({code:'23514'});
  });
});

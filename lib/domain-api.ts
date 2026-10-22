import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { domains, type DomainRow } from './domain';
import { AppError } from './errors';
import { assertMutation } from './auth-policy';
import { idSchema, parse, queryOptions, readBody } from './validation';
import { catalogSchemas, domainDeleteSchema, mixSchema, revisionSchema } from './week7-validation';
export const privateJson=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export function databaseCheck(error: {code?:string} | null) {
  if (!error) return;
  if (['23503','23001'].includes(error.code||'')) throw new AppError(409,'A related record is missing or still references this record. Review its relationships.');
  if (error.code==='23505') throw new AppError(409,'A record with that value already exists.');
  if (error.code==='23514') throw new AppError(409,'This change violates a data rule. Active chains must keep steps and enabled models/providers.');
  if (['40001','40P01'].includes(error.code||'')) throw new AppError(409,'The configuration changed. Reload and review before saving again.');
  if (error.code==='42501') throw new AppError(403,'The operation is not permitted. Recheck your admin access.');
  throw new AppError(503,'Database operation unavailable. No success has been confirmed.');
}
export const writesEnabled=()=>process.env.ADMIN_WRITES_ENABLED==='true';
export function assertJsonWrite(request:Request) { assertMutation(request,process.env.APP_ORIGIN,writesEnabled()); }
export function resourceFields(resource:string) {
  const d=domains[resource];
  const timestamps=['requests','media'].includes(resource)?['created_at']:['created_at','updated_at','revision'];
  return [...new Set(['id',...timestamps,...d.fields.map(f=>f.key)])].join(',');
}
// Called exclusively from handleAdmin, after adminDatabase -> requireAdmin.
export async function handleDomain(request:Request,path:string[],db:SupabaseClient,actor:{id:string}) {
  const [resource,id]=path;
  if (path.length>2) throw new AppError(404,'Not found.');
  const url=new URL(request.url);
  if (resource==='mix') {
    if (id) throw new AppError(404,'Not found.');
    if (request.method==='GET') {
      const rows:DomainRow[]=[];
      // Stable UUID order and full count; concurrent changes are rejected by RPC.
      for (let start=0;start<=1000;start+=250) {
        const r=await db.from('prompt_chains').select('id,name,version,mix_weight,revision').order('id').range(start,start+249);
        databaseCheck(r.error); rows.push(...(r.data||[]));
        if (rows.length>1000) throw new AppError(409,'More than 1,000 chains require a separately reviewed mix update.');
        if ((r.data||[]).length<250) break;
      }
      return privateJson({rows,writesEnabled:writesEnabled()});
    }
    assertJsonWrite(request);
    if (request.method!=='PATCH') throw new AppError(405,'Method not allowed.');
    const input=parse(mixSchema,await readBody(request,262144));
    const r=await db.rpc('admin_update_prompt_chain_mix',{p_actor_id:actor.id,p_changes:input.changes});
    databaseCheck(r.error); return privateJson({rows:r.data});
  }
  const d=domains[resource];
  if (request.method==='GET') {
    if (id) {
      parse(idSchema,id);
      const r=await db.from(d.table).select(resourceFields(resource)).eq('id',id).maybeSingle(); databaseCheck(r.error);
      if (!r.data) throw new AppError(404,'Record not found.');
      return privateJson({row:r.data,writesEnabled:writesEnabled()});
    }
    const opts=queryOptions(url);
    let q=db.from(d.table).select(resourceFields(resource),{count:'exact'});
    if (opts.q) q=d.search?q.ilike(d.search,`%${opts.q}%`):q.eq('id',parse(idSchema,opts.q));
    if (url.searchParams.has('filter')) {
      if (!d.filter) throw new AppError(400,'Unsupported filter.');
      q=q.eq(d.filter,parse(idSchema,url.searchParams.get('filter')));
    }
    const r=await q.order(resource==='steps'?'position':'created_at',{ascending:resource==='steps'||opts.ascending}).order('id').range(opts.from,opts.to);
    databaseCheck(r.error); return privateJson({rows:r.data,total:r.count??0,page:opts.page,writesEnabled:writesEnabled()});
  }
  assertJsonWrite(request);
  const schema=catalogSchemas[resource];
  if (!schema) throw new AppError(405,'This resource is read-only.');
  if (request.method==='POST'&&!id) {
    const input=parse(schema,await readBody(request,262144));
    const r=await db.from(d.table).insert(input).select('id').single();databaseCheck(r.error);
    return privateJson(r.data,201);
  }
  parse(idSchema,id);
  if (request.method==='PATCH') {
    const {revision,...input}=parse(schema.extend({revision:revisionSchema}).strict(),await readBody(request,262144));
    const r=await db.from(d.table).update(input).eq('id',id).eq('revision',revision).select('id').maybeSingle();databaseCheck(r.error);
    if (!r.data) throw new AppError(409,'This record changed or was removed. Reload before saving.');
    return privateJson(r.data);
  }
  if (request.method==='DELETE') {
    const input=parse(domainDeleteSchema,await readBody(request));
    const r=await db.from(d.table).delete().eq('id',id).eq('revision',input.revision).select('id').maybeSingle();databaseCheck(r.error);
    if (!r.data) throw new AppError(409,'This record changed or was removed. Reload before deleting.');
    return privateJson({deleted:true});
  }
  throw new AppError(405,'Method not allowed.');
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminDatabase } from './admin';
import { hasDomain } from './domain';
import { handleDomain } from './domain-api';
import { handleImages } from './image-api';
import { assertMutation } from './auth-policy';
import { AppError, errorResponse } from './errors';
import { createSchema, deleteSchema, editSchema, idSchema, parse, queryOptions, readBody } from './validation';
import { aggregate } from './analytics';
import type { Plan } from './types';
const planFields = 'id,generation_id,user_id,title,description,why_it_fits,place_id,place_name,address,rating,review_count,price_level,place_url,place_types,latitude,longitude,created_at';
function check(error: unknown) { if (error) throw new AppError(503, 'Database operation unavailable. No success has been confirmed.'); }
async function count(db: SupabaseClient, table: string, value?: number) {
  let query = db.from(table).select('id', {count:'exact',head:true});
  if (value !== undefined) query = query.eq('value',value);
  const result = await query; check(result.error); return result.count ?? 0;
}
async function scan(db: SupabaseClient, table: string, fields: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const result = await db.from(table).select(fields).order('created_at',{ascending:false}).order('id').range(offset,offset+499);
    check(result.error); const batch = result.data as unknown as Record<string, unknown>[];
    rows.push(...batch); if (batch.length < 500) break;
  }
  return rows;
}
async function dashboard(db: SupabaseClient) {
  const [users,plans,generations,positive,negative,planRows,voteRows] = await Promise.all([
    count(db,'profiles'), count(db,'plans'), count(db,'generations'),count(db,'votes',1),count(db,'votes',-1),
    scan(db,'plans',planFields),scan(db,'votes','id,plan_id,value,created_at'),
  ]);
  const recommendations = planRows as unknown as Plan[];
  return { users,plans,generations,positive,negative,recent:recommendations.slice(0,6),
    ...aggregate(recommendations,voteRows as unknown as {plan_id:string;value:number;created_at:string}[]),
    scannedPlans:planRows.length,scannedVotes:voteRows.length,sampled:plans > planRows.length || positive+negative > voteRows.length,asOf:new Date().toISOString() };
}
// This is the only data entrypoint. Authentication precedes parsing, queries and mutations.
export async function handleAdmin(request: Request, path: string[]) {
  try {
    const { db, actor } = await adminDatabase();
    const url = new URL(request.url), resource = path[0], id = path[1];
    if (resource === 'images') return await handleImages(request,path,db,actor);
    if (resource === 'mix' || hasDomain(resource)) return await handleDomain(request,path,db,actor);
    if (path.length > 2) throw new AppError(404,'Not found.');
    const json = (data: unknown, status = 200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
    if (request.method === 'GET') {
      if (resource === 'dashboard' && !id) return json(await dashboard(db));
      if (resource === 'recommendations' && id) {
        parse(idSchema,id);
        const result = await db.from('plans').select(planFields).eq('id',id).maybeSingle(); check(result.error);
        if (!result.data) throw new AppError(404,'Recommendation not found.');
        const [votes,saves] = await Promise.all([
          db.from('votes').select('id',{count:'exact',head:true}).eq('plan_id',id),
          db.from('saved_places').select('plan_id',{count:'exact',head:true}).eq('plan_id',id),
        ]); check(votes.error); check(saves.error);
        return json({plan:result.data,dependencies:{votes:votes.count??0,saves:saves.count??0},writesEnabled:process.env.ADMIN_WRITES_ENABLED==='true'});
      }
      if (id || !['profiles','recommendations','votes','generations'].includes(resource)) throw new AppError(404,'Not found.');
      const opts = queryOptions(url);
      const table = {profiles:'profiles',recommendations:'plans',votes:'votes',generations:'generations'}[resource]!;
      const columns = {profiles:'id,first_name,last_name,avatar_path,created_at,is_superadmin',recommendations:planFields,votes:'id,user_id,plan_id,value,created_at,plans(title)',generations:'id,user_id,provider,model,created_at'}[resource]!;
      let query = db.from(table).select(columns,{count:'exact'});
      if (opts.q) {
        if (resource === 'profiles') query = query.or(`first_name.ilike.%${opts.q}%,last_name.ilike.%${opts.q}%`);
        if (resource === 'recommendations') query = query.or(`title.ilike.%${opts.q}%,place_name.ilike.%${opts.q}%`);
        if (resource === 'votes') query = query.eq('user_id',parse(idSchema,opts.q));
        if (resource === 'generations') query = query.eq('id',parse(idSchema,opts.q));
      }
      if (resource === 'votes' && url.searchParams.get('value')) {
        const value = Number(url.searchParams.get('value')); if (![1,-1].includes(value)) throw new AppError(400,'Invalid vote filter.');
        query = query.eq('value',value);
      }
      const sortName = resource === 'profiles' && url.searchParams.get('sort') === 'name';
      const result = await query.order(sortName?'first_name':'created_at',{ascending:sortName||opts.ascending}).order('id').range(opts.from,opts.to); check(result.error);
      const totals = resource === 'votes' ? {positive:await count(db,'votes',1),negative:await count(db,'votes',-1)} : {};
      return json({rows:result.data,total:result.count??0,page:opts.page,...totals,writesEnabled:process.env.ADMIN_WRITES_ENABLED==='true'});
    }
    assertMutation(request,process.env.APP_ORIGIN,process.env.ADMIN_WRITES_ENABLED==='true');
    if (resource !== 'recommendations') throw new AppError(405,'This resource is read-only.');
    if (request.method === 'POST' && !id) {
      const input = parse(createSchema,await readBody(request));
      const generation = await db.from('generations').select('id,user_id').eq('id',input.generation_id).maybeSingle(); check(generation.error);
      if (!generation.data) throw new AppError(400,'Choose an existing generation.');
      const result = await db.from('plans').insert({...input,user_id:generation.data.user_id}).select('id').single(); check(result.error);
      return json(result.data,201);
    }
    parse(idSchema,id);
    if (request.method === 'PATCH') {
      const input = parse(editSchema,await readBody(request));
      // Deliberately preserve place metadata, coordinates, owner and generation.
      const result = await db.from('plans').update(input).eq('id',id).select('id').maybeSingle(); check(result.error);
      if (!result.data) throw new AppError(404,'Recommendation not found.'); return json(result.data);
    }
    if (request.method === 'DELETE') {
      parse(deleteSchema,await readBody(request));
      // No direct DELETE fallback: only the reviewed, transactional dependency guard.
      const result = await db.rpc('admin_delete_unreferenced_plan',{p_plan_id:id,p_actor_id:actor.id});
      if (result.error?.code === '23503') throw new AppError(409,'Deletion blocked: votes, saved places, or another dependency must be preserved.');
      if (result.error?.code === 'P0002') throw new AppError(404,'Recommendation not found.');
      if (result.error?.code === '42501') throw new AppError(403,'Admin authorization is no longer valid.');
      check(result.error); return json({deleted:true});
    }
    throw new AppError(405,'Method not allowed.');
  } catch (error) { return errorResponse(error); }
}

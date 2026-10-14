import { beforeEach,describe,it,expect,vi } from 'vitest';
import { AppError } from '../lib/errors';
const mocks=vi.hoisted(()=>({adminDatabase:vi.fn()}));
vi.mock('../lib/admin',()=>mocks);
import { handleAdmin } from '../lib/api';
import { GET,POST,PATCH,DELETE } from '../app/api/admin/[...path]/route';
const id='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
function database(results:unknown[]=[]) {
 const chain:Record<string,ReturnType<typeof vi.fn>>={};
 for(const method of ['select','eq','or','order','range','insert','update','delete','single','maybeSingle']) chain[method]=vi.fn(()=>chain);
 chain.then=vi.fn((resolve:(v:unknown)=>unknown)=>Promise.resolve(results.shift()??{data:[],count:0,error:null}).then(resolve));
 const db={from:vi.fn(()=>chain),rpc:vi.fn(async()=>({data:true,error:null}))};
 return {db,chain};
}
function req(method='GET',body?:unknown,origin='https://admin.example',query='') {return new Request('https://admin.example/api/admin/'+query,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
beforeEach(()=>{vi.resetAllMocks();process.env.APP_ORIGIN='https://admin.example';process.env.ADMIN_WRITES_ENABLED='true';});
describe('route authorization matrix',()=>{
 for(const status of [401,403]) for(const [method,path] of [['GET',['profiles']],['GET',['votes']],['GET',['dashboard']],['GET',['generations']],['GET',['recommendations']],['GET',['recommendations',id]],['POST',['recommendations']],['PATCH',['recommendations',id]],['DELETE',['recommendations',id]]] as const) {
   it(`${status} denies ${method} ${path.join('/')} without exposing records`,async()=>{
     mocks.adminDatabase.mockRejectedValue(new AppError(status,'Denied'));
     const response=await handleAdmin(req(method),[...path]);
     expect(response.status).toBe(status);expect(await response.json()).toEqual({error:'Denied'});expect(response.headers.get('cache-control')).toContain('no-store');
   });
 }
 it('all framework route methods delegate to the protected handler',async()=>{mocks.adminDatabase.mockRejectedValue(new AppError(401,'Denied'));for(const handler of [GET,POST,PATCH,DELETE]) {const r=await handler(req(),{params:Promise.resolve({path:['profiles']})});expect(r.status).toBe(401);}});
});
describe('authorized operations',()=>{
 it('reads only the selected profile columns with pagination',async()=>{const {db,chain}=database([{data:[{id,is_superadmin:false}],count:1,error:null}]);mocks.adminDatabase.mockResolvedValue({db,actor:{id:actor}});const response=await handleAdmin(req(),['profiles']);expect(response.status).toBe(200);expect((await response.json()).rows).toEqual([{id,is_superadmin:false}]);expect(chain.select).toHaveBeenCalledWith('id,first_name,last_name,avatar_path,created_at,is_superadmin',{count:'exact'});expect(chain.range).toHaveBeenCalledWith(0,24);});
 it('reads votes, associated recommendation, and aggregate totals',async()=>{const {db,chain}=database([{data:[{id,value:1,plans:{title:'Fixture'}}],count:1,error:null},{count:1,error:null},{count:0,error:null}]);mocks.adminDatabase.mockResolvedValue({db,actor:{id:actor}});const response=await handleAdmin(req(),['votes']);const data=await response.json();expect(data.positive).toBe(1);expect(data.negative).toBe(0);expect(chain.select.mock.calls[0][0]).toContain('plans(title)');});
 it('rejects ordinary-resource writes',async()=>{const {db}=database();mocks.adminDatabase.mockResolvedValue({db,actor:{id:actor}});expect((await handleAdmin(req('PATCH',{is_superadmin:true}),['profiles'])).status).toBe(405);expect(db.from).not.toHaveBeenCalled();});
 it('rejects disabled writes and cross-origin requests before accessing data',async()=>{const {db}=database();mocks.adminDatabase.mockResolvedValue({db,actor:{id:actor}});process.env.ADMIN_WRITES_ENABLED='false';expect((await handleAdmin(req('POST',{}),['recommendations'])).status).toBe(403);process.env.ADMIN_WRITES_ENABLED='true';expect((await handleAdmin(req('POST',{},'https://evil.example'),['recommendations'])).status).toBe(403);expect(db.from).not.toHaveBeenCalled();});
 it('preserves location and ownership on edit',async()=>{const {db,chain}=database([{data:{id},error:null}]);mocks.adminDatabase.mockResolvedValue({db,actor:{id:actor}});const body={title:'Test fixture',description:'Edited text',why_it_fits:'Edited note'};expect((await handleAdmin(req('PATCH',body),['recommendations',id])).status).toBe(200);expect(chain.update).toHaveBeenCalledWith(body);expect(chain.eq).toHaveBeenCalledWith('id',id);});
 it('rejects forged owner edits before a DB operation',async()=>{const {db}=database();mocks.adminDatabase.mockResolvedValue({db,actor:{id:actor}});expect((await handleAdmin(req('PATCH',{title:'x',description:'x',why_it_fits:'x',user_id:actor}),['recommendations',id])).status).toBe(400);expect(db.from).not.toHaveBeenCalled();});
 it('creates under the existing generation owner, not the caller or input owner',async()=>{const {db,chain}=database([{data:{id,user_id:actor},error:null},{data:{id},error:null}]);mocks.adminDatabase.mockResolvedValue({db,actor:{id}});const body={title:'Fixture',description:'Imported output',why_it_fits:'AI note',generation_id:id,place_id:'fixture',place_name:'Fixture',address:null,place_url:null,rating:null,review_count:null,price_level:null,place_types:[],latitude:null,longitude:null};expect((await handleAdmin(req('POST',body),['recommendations'])).status).toBe(201);expect(chain.insert).toHaveBeenCalledWith({...body,user_id:actor});});
 it('rejects missing generations without creating anything',async()=>{const {db,chain}=database([{data:null,error:null}]);mocks.adminDatabase.mockResolvedValue({db,actor:{id}});const body={title:'Fixture',description:'Imported output',why_it_fits:'AI note',generation_id:id,place_id:'fixture',place_name:'Fixture',address:null,place_url:null,rating:null,review_count:null,price_level:null,place_types:[],latitude:null,longitude:null};expect((await handleAdmin(req('POST',body),['recommendations'])).status).toBe(400);expect(chain.insert).not.toHaveBeenCalled();});
 it('uses only the transactional delete RPC with verified actor and explicit confirmation',async()=>{const {db,chain}=database();mocks.adminDatabase.mockResolvedValue({db,actor:{id:actor}});expect((await handleAdmin(req('DELETE',{confirmation:'DELETE'}),['recommendations',id])).status).toBe(200);expect(db.rpc).toHaveBeenCalledWith('admin_delete_unreferenced_plan',{p_plan_id:id,p_actor_id:actor});expect(chain.delete).not.toHaveBeenCalled();});
 it('never falls back to a cascading delete when the guard is unavailable or finds dependencies',async()=>{for(const [code,status] of [['23503',409],['42883',503],['42501',403],['P0002',404]]) {const {db,chain}=database();db.rpc.mockResolvedValue({data:false,error:{code,message:'private detail'}} as never);mocks.adminDatabase.mockResolvedValue({db,actor:{id:actor}});const response=await handleAdmin(req('DELETE',{confirmation:'DELETE'}),['recommendations',id]);expect(response.status).toBe(status);expect(await response.text()).not.toContain('private detail');expect(chain.delete).not.toHaveBeenCalled();}});
 it('requires deletion confirmation before invoking RPC',async()=>{const {db}=database();mocks.adminDatabase.mockResolvedValue({db,actor:{id}});expect((await handleAdmin(req('DELETE',{confirmation:'yes'}),['recommendations',id])).status).toBe(400);expect(db.rpc).not.toHaveBeenCalled();});
 it('sanitizes database failures and does not expose private messages',async()=>{const {db}=database([{data:null,error:{message:'SECRET connection details'}}]);mocks.adminDatabase.mockResolvedValue({db,actor:{id}});const response=await handleAdmin(req(),['profiles']);expect(response.status).toBe(503);expect(await response.text()).not.toContain('SECRET');});
});

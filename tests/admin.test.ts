import { afterEach,beforeEach,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({sessionClient:vi.fn(),createClient:vi.fn()}));
vi.mock('../lib/supabase',()=>({sessionClient:mocks.sessionClient}));
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.createClient}));
vi.mock('next/navigation',()=>({redirect:vi.fn()}));
import { adminDatabase, requireAdmin } from '../lib/admin';
const user={id:'verified',app_metadata:{provider:'google'},identities:[{provider:'google'}]};
function session(identity:unknown=user,error:unknown=null) { return {auth:{getUser:vi.fn(async()=>({data:{user:identity},error}))},from:vi.fn()}; }
function lookup(data:unknown={is_superadmin:true},error:unknown=null) {
 const chain={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(async()=>({data,error}))};
 chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);
 const db={from:vi.fn(()=>chain)};mocks.createClient.mockReturnValueOnce(db);return {db,chain};
}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://test.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-server-key');mocks.sessionClient.mockResolvedValue(session());});
afterEach(()=>vi.unstubAllEnvs());
it.each([null,{...user,app_metadata:{provider:'email'}},{...user,identities:[]}])('does not construct any privileged client for invalid identity %j',async identity=>{
 mocks.sessionClient.mockResolvedValue(session(identity));await expect(adminDatabase()).rejects.toMatchObject({status:identity?403:401});expect(mocks.createClient).not.toHaveBeenCalled();
});
it('rejects an auth error even if a user is returned',async()=>{mocks.sessionClient.mockResolvedValue(session(user,{message:'invalid'}));await expect(requireAdmin()).rejects.toMatchObject({status:401});expect(mocks.createClient).not.toHaveBeenCalled();});
it.each([null,{is_superadmin:false},{},{is_superadmin:'true'},{is_superadmin:1}])('denies %j after only the narrow lookup',async data=>{
 lookup(data);await expect(adminDatabase()).rejects.toMatchObject({status:403});expect(mocks.createClient).toHaveBeenCalledTimes(1);
});
it('sanitizes lookup failures and never constructs a CRUD client',async()=>{
 lookup(null,{message:'private database detail'});await expect(adminDatabase()).rejects.toMatchObject({status:503,message:'Admin authorization is unavailable. Check the reviewed database setup.'});expect(mocks.createClient).toHaveBeenCalledTimes(1);
});
it('sanitizes thrown lookup failures',async()=>{const {chain}=lookup();chain.maybeSingle.mockRejectedValue(new Error('private detail'));await expect(requireAdmin()).rejects.toMatchObject({status:503});});
it('fails closed without service configuration',async()=>{vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','');await expect(requireAdmin()).rejects.toMatchObject({status:503});expect(mocks.createClient).not.toHaveBeenCalled();});
it('verifies identity, performs one-column lookup, then constructs a distinct CRUD client',async()=>{
 const s=session();mocks.sessionClient.mockResolvedValue(s);const {db,chain}=lookup();const crud={};mocks.createClient.mockReturnValueOnce(crud);
 expect(await adminDatabase()).toEqual({actor:{id:'verified'},db:crud});expect(crud).not.toBe(db);
 expect(s.from).not.toHaveBeenCalled();expect(db.from).toHaveBeenCalledExactlyOnceWith('profiles');expect(chain.select).toHaveBeenCalledExactlyOnceWith('is_superadmin');expect(chain.eq).toHaveBeenCalledExactlyOnceWith('id','verified');
 expect(s.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.createClient.mock.invocationCallOrder[0]);
 expect(chain.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(mocks.createClient.mock.invocationCallOrder[1]);
 const options=mocks.createClient.mock.calls[0][2];expect(options).toEqual({auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:expect.any(Function)}});
});
it('requireAdmin returns only the actor and does not construct CRUD access',async()=>{lookup();expect(await requireAdmin()).toEqual({id:'verified'});expect(mocks.createClient).toHaveBeenCalledTimes(1);});
it('rechecks revoked roles on subsequent requests',async()=>{lookup();mocks.createClient.mockReturnValueOnce({});lookup({is_superadmin:false});await adminDatabase();await expect(adminDatabase()).rejects.toMatchObject({status:403});expect(mocks.createClient).toHaveBeenCalledTimes(3);});

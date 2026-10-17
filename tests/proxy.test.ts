import { afterEach,beforeEach,it,expect,vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({createServerClient:vi.fn(),createClient:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocks.createServerClient}));
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.createClient}));
import { proxy } from '../proxy';
const user={id:'verified',app_metadata:{provider:'google'},identities:[{provider:'google'}]};
let session: {auth:{getUser:ReturnType<typeof vi.fn>};from:ReturnType<typeof vi.fn>};
let chain: {select:ReturnType<typeof vi.fn>;eq:ReturnType<typeof vi.fn>;maybeSingle:ReturnType<typeof vi.fn>};
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://test.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','test-public-key');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-server-key');
 session={auth:{getUser:vi.fn().mockResolvedValue({data:{user},error:null})},from:vi.fn()};mocks.createServerClient.mockReturnValue(session);
 chain={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{is_superadmin:true},error:null})};mocks.createClient.mockReturnValue({from:vi.fn(()=>chain)});
});
afterEach(()=>vi.unstubAllEnvs());
const request=()=>new NextRequest('https://admin.example/users?user_id=forged',{headers:{cookie:'sage-admin-auth=user-cookie',authorization:'Bearer user-token'}});
it('uses verified identity with a separate cookie-free service client',async()=>{
 const result=await proxy(request());expect(result.status).toBe(200);expect(session.from).not.toHaveBeenCalled();expect(chain.eq).toHaveBeenCalledExactlyOnceWith('id','verified');expect(chain.select).toHaveBeenCalledExactlyOnceWith('is_superadmin');
 expect(mocks.createClient).toHaveBeenCalledExactlyOnceWith('https://test.supabase.co','test-server-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:expect.any(Function)}});
 expect(session.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.createClient.mock.invocationCallOrder[0]);
});
it.each([null,{...user,app_metadata:{provider:'email'}},{...user,identities:[]}])('rejects invalid identity before lookup %j',async identity=>{
 session.auth.getUser.mockResolvedValue({data:{user:identity},error:null});const result=await proxy(request());expect(result.status).toBe(307);expect(result.headers.get('location')).toBe(`https://admin.example/${identity?'denied':'login'}`);expect(mocks.createClient).not.toHaveBeenCalled();
});
it.each([null,{is_superadmin:false},{is_superadmin:'true'}])('denies non-admin flag %j',async data=>{chain.maybeSingle.mockResolvedValue({data,error:null});expect((await proxy(request())).headers.get('location')).toBe('https://admin.example/denied');});
it('returns sanitized unavailable response on lookup errors',async()=>{chain.maybeSingle.mockResolvedValue({data:null,error:{message:'private detail'}});const result=await proxy(request());expect(result.status).toBe(503);expect(await result.text()).not.toContain('private detail');expect(result.headers.get('cache-control')).toContain('no-store');});
it('leaves callback authorization to its own requireAdmin check',async()=>{await proxy(new NextRequest('https://admin.example/auth/callback'));expect(mocks.createClient).not.toHaveBeenCalled();});

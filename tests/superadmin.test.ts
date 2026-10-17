import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { lookupSuperadmin } from '../lib/superadmin';
beforeEach(()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://test.supabase.co');
 vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','synthetic-service-key');
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('sends only the scoped query using service authorization and no cookies',async()=>{
 const network=vi.fn().mockResolvedValue(new Response(JSON.stringify({is_superadmin:true}),{status:200,headers:{'content-type':'application/json'}}));
 vi.stubGlobal('fetch',network);
 expect(await lookupSuperadmin('verified-user')).toBe(true);
 expect(network).toHaveBeenCalledOnce();
 const [url,init]=network.mock.calls[0];const query=new URL(url);
 expect(query.pathname).toBe('/rest/v1/profiles');
 expect([...query.searchParams]).toEqual([['select','is_superadmin'],['id','eq.verified-user']]);
 const headers=new Headers(init.headers);
 expect(headers.get('authorization')).toBe('Bearer synthetic-service-key');
 expect(headers.get('apikey')).toBe('synthetic-service-key');
 expect(headers.has('cookie')).toBe(false);
 expect(init.cache).toBe('no-store');
 expect(init.method).toBe('GET');
});

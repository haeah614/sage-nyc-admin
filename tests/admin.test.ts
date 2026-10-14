import { beforeEach,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({sessionClient:vi.fn(),createClient:vi.fn()}));
vi.mock('../lib/supabase',()=>({sessionClient:mocks.sessionClient}));
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.createClient}));
vi.mock('next/navigation',()=>({redirect:vi.fn()}));
import { adminDatabase } from '../lib/admin';
const user={id:'verified',app_metadata:{provider:'google'},identities:[{provider:'google'}]};
function session(identity:unknown,flag:boolean,error:unknown=null) { const chain={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(async()=>({data:{is_superadmin:flag},error}))};chain.select.mockReturnValue(chain);chain.eq.mockReturnValue(chain);return {auth:{getUser:vi.fn(async()=>({data:{user:identity},error:null}))},from:vi.fn(()=>chain)}; }
beforeEach(()=>{vi.resetAllMocks();process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-server-key';});
it('does not construct a privileged client for signed-out users',async()=>{mocks.sessionClient.mockResolvedValue(session(null,false));await expect(adminDatabase()).rejects.toMatchObject({status:401});expect(mocks.createClient).not.toHaveBeenCalled();});
it('does not construct a privileged client for ordinary members',async()=>{mocks.sessionClient.mockResolvedValue(session(user,false));await expect(adminDatabase()).rejects.toMatchObject({status:403});expect(mocks.createClient).not.toHaveBeenCalled();});
it('does not construct a privileged client when the flag is missing or inaccessible',async()=>{mocks.sessionClient.mockResolvedValue(session(user,false,{message:'missing column'}));await expect(adminDatabase()).rejects.toMatchObject({status:503});expect(mocks.createClient).not.toHaveBeenCalled();});
it('verifies live identity and DB flag before constructing the server client',async()=>{const s=session(user,true);mocks.sessionClient.mockResolvedValue(s);await adminDatabase();expect(s.auth.getUser).toHaveBeenCalledOnce();expect(s.from).toHaveBeenCalledWith('profiles');expect(mocks.createClient).toHaveBeenCalledOnce();expect(s.auth.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.createClient.mock.invocationCallOrder[0]);});
it('rechecks role changes on the next operation rather than caching authorization',async()=>{mocks.sessionClient.mockResolvedValueOnce(session(user,true)).mockResolvedValueOnce(session(user,false));await adminDatabase();await expect(adminDatabase()).rejects.toMatchObject({status:403});expect(mocks.createClient).toHaveBeenCalledOnce();});

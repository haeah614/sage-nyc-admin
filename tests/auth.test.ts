import { describe,it,expect,vi } from 'vitest';
import { authorize,assertMutation } from '../lib/auth-policy';
const user={id:'actor',app_metadata:{provider:'google'},identities:[{provider:'google'}]};
describe('deny-by-default identity and database authorization',()=>{
 it('denies unauthenticated access before a profile read',async()=>{const flag=vi.fn();await expect(authorize(async()=>null,flag)).rejects.toMatchObject({status:401});expect(flag).not.toHaveBeenCalled();});
 it('denies an ordinary Google user',async()=>{await expect(authorize(async()=>user,async()=>false)).rejects.toMatchObject({status:403});});
 it('allows only a Google user with a true DB flag',async()=>{expect(await authorize(async()=>user,async()=>true)).toEqual({id:'actor'});});
 it('rejects a non-Google session even with an admin flag',async()=>{await expect(authorize(async()=>({...user,app_metadata:{provider:'email'}}),async()=>true)).rejects.toMatchObject({status:403});});
 it('does not trust a metadata-only Google claim',async()=>{await expect(authorize(async()=>({...user,identities:[]}),async()=>true)).rejects.toMatchObject({status:403});});
 it('fails closed on authorization lookup failures',async()=>{await expect(authorize(async()=>user,async()=>{throw new Error('unavailable');})).rejects.toThrow();});
 it('looks up the authenticated ID rather than a supplied user ID',async()=>{const flag=vi.fn(async()=>true);await authorize(async()=>user,flag);expect(flag).toHaveBeenCalledWith('actor');});
});
describe('mutation gates',()=>{
 const request=(origin?:string,type='application/json')=>new Request('https://admin.example/api/admin/recommendations',{method:'POST',headers:{...(origin?{origin}:{}),'content-type':type}});
 it('rejects a missing or foreign origin',()=>{for (const origin of [undefined,'https://evil.example']) expect(()=>assertMutation(request(origin),'https://admin.example',true)).toThrow();});
 it('blocks writes by default',()=>{expect(()=>assertMutation(request('https://admin.example'),'https://admin.example',false)).toThrow('Writes are disabled');});
 it('rejects form submissions to mutation endpoints',()=>{expect(()=>assertMutation(request('https://admin.example','text/plain'),'https://admin.example',true)).toThrow('application/json');});
 it('allows an approved same-origin JSON mutation',()=>{expect(()=>assertMutation(request('https://admin.example'),'https://admin.example',true)).not.toThrow();});
});

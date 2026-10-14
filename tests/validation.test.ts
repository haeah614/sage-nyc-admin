import { describe,it,expect } from 'vitest';
import { createSchema,editSchema,deleteSchema,parse,readBody,queryOptions } from '../lib/validation';
const base={title:'A city idea',description:'An original recommendation',why_it_fits:'A thoughtful SAGE Note'};
const create={...base,generation_id:'11111111-1111-4111-8111-111111111111',place_id:'place-original',place_name:'Test fixture',address:null,place_url:null,rating:null,review_count:null,price_level:null,place_types:[],latitude:null,longitude:null};
describe('recommendation validation',()=>{
 it('accepts existing-schema-compatible text',()=>expect(parse(editSchema,base)).toEqual(base));
 it('rejects empty, oversized and unknown fields',()=>{for (const input of [{...base,title:''},{...base,description:'x'.repeat(281)},{...base,why_it_fits:'x'.repeat(351)},{...base,is_superadmin:true}])expect(()=>parse(editSchema,input)).toThrow();});
 it('cannot change IDs, owners, coordinates or place metadata in an edit',()=>{for(const field of ['id','user_id','generation_id','place_id','latitude','longitude','rating'])expect(()=>parse(editSchema,{...base,[field]:'changed'})).toThrow();});
 it('accepts creation without inventing missing optional data',()=>expect(parse(createSchema,create)).toEqual(create));
 it('validates coordinates as a pair',()=>{expect(()=>parse(createSchema,{...create,latitude:40.8})).toThrow();expect(()=>parse(createSchema,{...create,latitude:91,longitude:0})).toThrow();});
 it('rejects unsafe URLs, invalid ratings, types and owner spoofing',()=>{for(const extra of [{place_url:'javascript:alert(1)'},{rating:6},{rating:4.22},{review_count:-1},{price_level:5},{place_types:['x,y']},{user_id:'spoof'}])expect(()=>parse(createSchema,{...create,...extra})).toThrow();});
 it('requires exact explicit deletion confirmation',()=>{expect(()=>parse(deleteSchema,{confirmation:'yes'})).toThrow();expect(parse(deleteSchema,{confirmation:'DELETE'})).toEqual({confirmation:'DELETE'});});
 it('bounds and escapes query input by rejecting filter syntax',()=>{for(const q of ['a,b','a%','a(b)','a*'])expect(()=>queryOptions(new URL('https://admin.example?q='+encodeURIComponent(q)))).toThrow();expect(()=>queryOptions(new URL('https://admin.example?page=-1'))).toThrow();});
 it('rejects malformed JSON and oversized streamed requests',async()=>{await expect(readBody(new Request('https://admin.example',{method:'POST',body:'{'}))).rejects.toMatchObject({status:400});await expect(readBody(new Request('https://admin.example',{method:'POST',body:'x'.repeat(16001)}))).rejects.toMatchObject({status:413});});
});

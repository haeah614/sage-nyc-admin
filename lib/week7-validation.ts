import 'server-only';
import { domainToASCII } from 'node:url';
import { z } from 'zod';
const text=(max:number)=>z.string().trim().min(1).max(max);
export const revisionSchema=z.number().int().min(1).max(2147483646);
const domain=z.string().trim().toLowerCase().transform(value=>domainToASCII(value)).pipe(z.string().max(253).regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/));
export const catalogSchemas: Record<string,z.ZodObject> = {
  terms:z.object({term:text(120),definition:text(5000)}).strict(),
  examples:z.object({title:text(160),input_text:text(20000),output_text:text(20000),provenance:text(2000),source_response_id:z.uuid().nullable()}).strict(),
  providers:z.object({slug:text(120).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),name:text(120),website_url:z.url().max(2000).refine(v=>new URL(v).protocol==='https:','Use HTTPS.').nullable(),enabled:z.boolean()}).strict(),
  models:z.object({provider_id:z.uuid(),model_key:text(200),display_name:text(120),enabled:z.boolean()}).strict(),
  domains:z.object({domain,enabled:z.boolean()}).strict(),
  emails:z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254)),enabled:z.boolean()}).strict(),
};
export const imageMetaSchema=z.object({title:text(160),alt_text:z.string().trim().max(2000)}).strict();
export const revisionBody=z.object({revision:revisionSchema}).strict();
export const domainDeleteSchema=revisionBody.extend({confirmation:z.literal('DELETE')}).strict();
export const mixSchema=z.object({changes:z.array(z.object({id:z.uuid(),revision:revisionSchema,weight:z.number().int().min(0).max(10000)}).strict()).max(1000)}).strict().refine(v=>new Set(v.changes.map(c=>c.id)).size===v.changes.length,'Duplicate chain.');

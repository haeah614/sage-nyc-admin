import { z } from 'zod';
import { AppError } from './errors';
const text = (max: number) => z.string().trim().min(1).max(max);
export const idSchema = z.uuid();
export const editSchema = z.object({ title: text(100), description: text(280), why_it_fits: text(350) }).strict();
export const createSchema = editSchema.extend({
  generation_id: z.uuid(), place_id: text(300), place_name: text(300),
  address: z.string().trim().max(500).nullable(),
  place_url: z.url().max(2000).refine(s => new URL(s).protocol === 'https:', 'Use an HTTPS URL.').nullable(),
  rating: z.number().min(0).max(5).multipleOf(0.1).nullable(),
  review_count: z.number().int().min(0).max(2147483647).nullable(),
  price_level: z.number().int().min(0).max(4).nullable(),
  place_types: z.array(z.string().regex(/^[a-z_]+$/).max(80)).max(30),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
}).strict().refine(v => (v.latitude === null) === (v.longitude === null), 'Supply both coordinates or neither.');
export const deleteSchema = z.object({ confirmation: z.literal('DELETE') }).strict();
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError(400, result.error.issues.map(i => `${i.path.join('.') || 'Input'}: ${i.message}`).join(' '));
  return result.data;
}
export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'A JSON body is required.');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 16000) { await reader.cancel(); throw new AppError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'Invalid JSON.'); }
}
export function queryOptions(url: URL) {
  const page = Number(url.searchParams.get('page') || 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw new AppError(400, 'Invalid page.');
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length > 100 || /[^\p{L}\p{N} .@_'-]/u.test(q)) throw new AppError(400, 'Search contains unsupported characters.');
  return { page, q, from: (page - 1) * 25, to: page * 25 - 1, ascending: url.searchParams.get('sort') === 'oldest' };
}

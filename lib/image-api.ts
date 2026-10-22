import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './errors';
import { parse, idSchema, readBody } from './validation';
import { imageMetaSchema, revisionSchema, revisionBody, domainDeleteSchema } from './week7-validation';
import { assertJsonWrite, databaseCheck, privateJson, writesEnabled, handleDomain } from './domain-api';
export const IMAGE_LIMIT=5*1024*1024;
const BUCKET='admin-images';
const RECOVERY_DELAY=10*60*1000;
const imageFields='id,revision,created_at,updated_at,bucket_id,object_path,pending_object_path,title,alt_text,mime_type,byte_size,width,height,status,uploaded_by';
export type ImageRow={id:string;revision:number;updated_at:string;bucket_id:string;object_path:string;pending_object_path:string|null;title:string;alt_text:string;mime_type:string;byte_size:number;width:number;height:number;status:string;uploaded_by:string|null};
const pathPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
function safePath(row:ImageRow,path:string) {
  if (row.bucket_id!==BUCKET||!pathPattern.test(path)||path.split('/')[0]!==row.id) throw new AppError(409,'Image storage reference requires manual review.');
  return path;
}
export function assertRecoveryReady(row:ImageRow) {
  if (!Number.isFinite(Date.parse(row.updated_at))||Date.now()-Date.parse(row.updated_at)<RECOVERY_DELAY) throw new AppError(409,'This image operation may still be running. Wait ten minutes, then reload before recovery.');
}
export async function normalizeImage(bytes:Buffer,claimedType:string) {
  if (!bytes.length||bytes.length>IMAGE_LIMIT) throw new AppError(413,'Choose an image no larger than 5 MiB.');
  const formats:Record<string,string>={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'};
  if (!formats[claimedType]) throw new AppError(415,'Choose JPEG, PNG, or WebP.');
  try {
    const decoder=sharp(bytes,{limitInputPixels:40000000,failOn:'warning'}).timeout({seconds:10});
    const meta=await decoder.metadata();
    if (meta.format!==formats[claimedType]||(meta.pages??1)!==1||!meta.width||!meta.height||meta.width>10000||meta.height>10000) throw new Error('Invalid image');
    // Decode all pixels, strip embedded metadata, apply orientation, normalize.
    const {data,info}=await decoder.rotate().webp({quality:90}).toBuffer({resolveWithObject:true});
    if (data.length>IMAGE_LIMIT) throw new AppError(413,'Normalized image exceeds 5 MiB. Choose a smaller image.');
    return {bytes:data,mime_type:'image/webp',byte_size:data.length,width:info.width,height:info.height};
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400,'The file could not be decoded as a supported, single-frame image.');
  }
}
async function uploadBody(request:Request,replacing:boolean) {
  if (!process.env.APP_ORIGIN||request.headers.get('origin')!==process.env.APP_ORIGIN) throw new AppError(403,'Request origin is not allowed.');
  if (!writesEnabled()) throw new AppError(403,'Writes are disabled pending approval.');
  const type=request.headers.get('content-type')||'';
  if (!type.startsWith('multipart/form-data;')) throw new AppError(415,'Use a multipart image upload.');
  const reader=request.body?.getReader(); if (!reader) throw new AppError(400,'An image file is required.');
  const chunks:Uint8Array[]=[];let size=0;
  while (true) {
    const r=await reader.read();if (r.done) break;
    size+=r.value.length;if(size>IMAGE_LIMIT+16384) {await reader.cancel();throw new AppError(413,'Upload exceeds 5 MiB plus form metadata.');}chunks.push(r.value);
  }
  let form:FormData;
  try {form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':type}}).formData();} catch {throw new AppError(400,'Invalid multipart upload.');}
  const allowed=replacing?['title','alt_text','file','revision']:['title','alt_text','file'];
  for(const key of form.keys()) if(!allowed.includes(key)||form.getAll(key).length!==1) throw new AppError(400,'Unexpected or duplicate upload field.');
  const meta=parse(imageMetaSchema,{title:form.get('title'),alt_text:form.get('alt_text')??''});
  const revision=replacing?parse(revisionSchema,Number(form.get('revision'))):undefined;
  const file=form.get('file');if(!file||typeof file==='string') throw new AppError(400,'An image file is required.');
  return {meta,revision,...await normalizeImage(Buffer.from(await file.arrayBuffer()),file.type)};
}
async function readImage(db:SupabaseClient,id:string) {
  const r=await db.from('images').select(imageFields).eq('id',id).maybeSingle();databaseCheck(r.error);
  if(!r.data) throw new AppError(404,'Image not found.');return r.data as ImageRow;
}
async function change(db:SupabaseClient,row:ImageRow,patch:Record<string,unknown>):Promise<ImageRow> {
  const r=await db.from('images').update(patch).eq('id',row.id).eq('revision',row.revision).eq('status',row.status).select(imageFields).maybeSingle();databaseCheck(r.error);
  if(!r.data) throw new AppError(409,'Image changed. Reload before continuing.');return r.data as ImageRow;
}
async function removeObjects(db:SupabaseClient,row:ImageRow,paths:string[]) {
  const r=await db.storage.from(BUCKET).remove(paths.map(p=>safePath(row,p)));
  if(r.error) throw new AppError(503,'Storage cleanup is incomplete. Reload this image and retry recovery after ten minutes.');
}
// All entrypoints are dispatched only after adminDatabase/requireAdmin.
export async function handleImages(request:Request,path:string[],db:SupabaseClient,actor:{id:string}) {
  const [,id,action]=path;
  if(path.length>3) throw new AppError(404,'Not found.');
  if(request.method==='GET'&&!action) {
    if(!id) return handleDomain(request,path,db,actor);
    parse(idSchema,id);return privateJson({row:await readImage(db,id),writesEnabled:writesEnabled()});
  }
  if(request.method==='GET'&&action==='content') {
    parse(idSchema,id);const row=await readImage(db,id);
    if(row.status!=='ready') throw new AppError(409,'This image is not ready for preview.');
    const r=await db.storage.from(BUCKET).download(safePath(row,row.object_path));
    if(r.error||!r.data) throw new AppError(503,'Image preview is unavailable.');
    return new Response(r.data,{headers:{'Content-Type':row.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
  }
  if(request.method==='POST'&&(!id||action==='replace')) {
    if(id) parse(idSchema,id);
    const input=await uploadBody(request,!!id);
    const assetId=id||randomUUID();const objectPath=`${assetId}/${randomUUID()}.webp`;
    const {bytes,meta,revision,...fileMeta}=input;
    let row:ImageRow;
    if(id) {
      row=await readImage(db,id);
      if(row.status!=='ready'||row.revision!==revision) throw new AppError(409,'Image changed or is busy. Reload before replacing.');
      safePath(row,row.object_path);
      row=await change(db,row,{status:'replacing',pending_object_path:objectPath});
    } else {
      const r=await db.from('images').insert({id:assetId,...meta,...fileMeta,bucket_id:BUCKET,object_path:objectPath,status:'uploading',uploaded_by:actor.id}).select(imageFields).single();databaseCheck(r.error);row=r.data as ImageRow;
    }
    // Reserve paths before upload. On any uncertain result leave the persisted
    // operation for delayed recovery; never lose the only reference to an object.
    const uploaded=await db.storage.from(BUCKET).upload(objectPath,bytes,{contentType:'image/webp',upsert:false,cacheControl:'0'});
    if(uploaded.error) throw new AppError(503,'Upload was not confirmed. Open Images to review the pending record and recover after ten minutes.');
    if(id) {
      const oldPath=row.object_path;
      row=await change(db,row,{...meta,...fileMeta,object_path:objectPath,pending_object_path:oldPath});
      await removeObjects(db,row,[oldPath]);
    }
    row=await change(db,row,{status:'ready',pending_object_path:null});
    return privateJson({id:row.id},id?200:201);
  }
  assertJsonWrite(request);parse(idSchema,id);
  let row=await readImage(db,id);
  if(request.method==='PATCH'&&!action) {
    const {revision,...meta}=parse(imageMetaSchema.extend({revision:revisionSchema}).strict(),await readBody(request));
    if(row.status!=='ready'||row.revision!==revision) throw new AppError(409,'Image changed or is busy. Reload before editing.');
    row=await change(db,row,meta);return privateJson({id:row.id});
  }
  if(request.method==='POST'&&action==='recover') {
    const {revision}=parse(revisionBody,await readBody(request));
    if(row.status!=='replacing'||row.revision!==revision||!row.pending_object_path) throw new AppError(409,'No matching replacement to recover. Reload this image.');
    assertRecoveryReady(row);
    row=await change(db,row,{status:'replacing'}); // claim with compare-and-swap
    await removeObjects(db,row,[row.pending_object_path!]);
    row=await change(db,row,{status:'ready',pending_object_path:null});
    return privateJson({id:row.id});
  }
  if(request.method==='DELETE'&&!action) {
    const input=parse(domainDeleteSchema,await readBody(request));
    if(row.revision!==input.revision) throw new AppError(409,'Image changed. Reload before deleting.');
    if(row.status!=='ready') assertRecoveryReady(row);
    row=await change(db,row,{status:'deleting'});
    await removeObjects(db,row,[row.object_path,...(row.pending_object_path?[row.pending_object_path]:[])]);
    const r=await db.from('images').delete().eq('id',row.id).eq('revision',row.revision).eq('status','deleting').select('id').maybeSingle();databaseCheck(r.error);
    if(!r.data) throw new AppError(409,'Image cleanup needs a reload before confirmation.');
    return privateJson({deleted:true});
  }
  throw new AppError(405,'Method not allowed.');
}

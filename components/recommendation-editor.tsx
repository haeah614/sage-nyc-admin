"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Trash2, MapPin, LockKeyhole, ArrowUpRight } from 'lucide-react';
import type { Generation, List, Plan } from '@/lib/types';
import { Back, PageHeading, Status, date, useData, Pager } from './ui';
async function mutate(url:string,method:string,body:unknown) {
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error||'The change could not be saved.');
  return data;
}
export function RecommendationEditor({id}:{id:string}) { return id==='new'?<NewRecommendation/>:<ExistingRecommendation key={id} id={id}/>; }
function ExistingRecommendation({id}:{id:string}) {
  const [saved,setSaved]=useState(false);
  const {data,error,reload}=useData<{plan:Plan;dependencies:{votes:number;saves:number};writesEnabled:boolean}>(`/api/admin/recommendations/${id}`);
  if (!data) return <>{saved&&<p role="status" className="success">Recommendation saved. Reloading persisted details.</p>}<Status error={error} reload={reload}/></>;
  return <><Back/><PageHeading eyebrow="THE EDITOR’S DESK" title="A closer look." description="Care for the idea. Keep its provenance intact."/><div className="editor-grid"><section className="panel"><h2>Edit recommendation</h2><RecommendationForm plan={data.plan} enabled={data.writesEnabled} saved={saved} onSaveStart={()=>setSaved(false)} onSaved={()=>{setSaved(true);reload();}}/></section><aside><section className="panel place-detail"><MapPin size={24}/><h2>{data.plan.place_name}</h2><p>{data.plan.address||'No address recorded'}</p><div className="tag-list">{data.plan.place_types.map(t=><span className="pill" key={t}>{t.replaceAll('_',' ')}</span>)}</div><dl><dt>Place rating</dt><dd>{data.plan.rating??'—'} / 5</dd><dt>Review count</dt><dd>{data.plan.review_count??'—'}</dd><dt>Price level</dt><dd>{data.plan.price_level??'—'}</dd><dt>Coordinates</dt><dd>{data.plan.latitude??'—'}, {data.plan.longitude??'—'}</dd><dt>Place ID</dt><dd><code>{data.plan.place_id}</code></dd><dt>Recommendation ID</dt><dd><code>{data.plan.id}</code></dd><dt>Generation ID</dt><dd><code>{data.plan.generation_id}</code></dd><dt>Owner ID</dt><dd><code>{data.plan.user_id}</code></dd><dt>Created (UTC)</dt><dd>{date(data.plan.created_at)}</dd></dl>{data.plan.place_url?.startsWith('https://')&&<a className="text-link" href={data.plan.place_url} target="_blank" rel="noreferrer">Open place link<ArrowUpRight size={15}/></a>}<p className="small muted"><LockKeyhole size={14}/> Place metadata, coordinates, ownership, and generation history are preserved when editing.</p></section><DeletePanel plan={data.plan} dependencies={data.dependencies} enabled={data.writesEnabled}/></aside></div></>;
}
function NewRecommendation() {
  const [page,setPage]=useState(1),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[q,setQ]=useState('');
  const {data,error,reload}=useData<List<Generation>&{writesEnabled:boolean}>(`/api/admin/generations?page=${page}&q=${encodeURIComponent(q)}`);
  return <><Back/><PageHeading eyebrow="MAKE ROOM FOR A GOOD IDEA" title="A new city discovery." description="Import an AI-generated recommendation into its existing generation."/><div className="editor-grid"><section className="panel"><h2>Recommendation details</h2><p className="muted">Use the original AI output. The app does not call Google Places or generate new AI content.</p><RecommendationForm enabled={data?.writesEnabled} permissionError={error} generationId={selected}/></section><aside className="panel generation-picker"><span className="eyebrow">01 · PRESERVE PROVENANCE</span><h2>Choose a generation</h2><p className="muted small">The new recommendation inherits this generation’s owner. Prompt text is not exposed in this selector.</p><form className="search" onSubmit={e=>{e.preventDefault();setQ(search);setPage(1);}}><input aria-label="Find generation by UUID" placeholder="Find by full UUID" value={search} onChange={e=>setSearch(e.target.value)}/><button className="secondary">Find</button></form>{!data?<Status error={error} reload={reload}/>:<><div className="generation-list">{data.rows.map(g=><label className={selected===g.id?'selected':''} key={g.id}><input type="radio" name="generation" checked={selected===g.id} onChange={()=>setSelected(g.id)}/><span><strong>{g.model}</strong><small>{g.provider} · {date(g.created_at)}</small><code>{g.id}</code></span></label>)}{!data.rows.length&&<p>No generations found. An existing generation is required.</p>}</div><Pager page={page} total={data.total} setPage={setPage}/></>}</aside></div></>;
}
function RecommendationForm({plan,enabled,permissionError,generationId,saved,onSaveStart,onSaved}:{plan?:Plan;enabled?:boolean;permissionError?:string;generationId?:string;saved?:boolean;onSaveStart?:()=>void;onSaved?:()=>void}) {
  const router=useRouter(),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[success,setSuccess]=useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enabled !== true || pending || (!plan && !generationId)) return;
    onSaveStart?.();setPending(true);setMessage('');setSuccess(false);
    const form=new FormData(event.currentTarget);
    const text=(key:string)=>String(form.get(key)||'').trim();
    const numeric=(key:string)=>text(key)===''?null:Number(text(key));
    const input={title:text('title'),description:text('description'),why_it_fits:text('why_it_fits')};
    try {
      const body=plan?input:{...input,generation_id:generationId,place_id:text('place_id'),place_name:text('place_name'),address:text('address')||null,place_url:text('place_url')||null,rating:numeric('rating'),review_count:numeric('review_count'),price_level:numeric('price_level'),latitude:numeric('latitude'),longitude:numeric('longitude'),place_types:text('place_types').split(',').map(t=>t.trim()).filter(Boolean)};
      const result=await mutate(plan?`/api/admin/recommendations/${plan.id}`:'/api/admin/recommendations',plan?'PATCH':'POST',body);
      if (plan) {
        // Re-read persisted data for both the editor and delete confirmation.
        // Reload hides deletion until the authoritative response is available.
        onSaved?.();
      } else {
        setSuccess(true);setMessage('Recommendation saved.');router.push(`/recommendations/${result.id}`);
      }
    } catch(error) {setMessage(error instanceof Error?error.message:'Unable to save.');} finally {setPending(false);}
  }
  return <form className="editor-form" onSubmit={submit}>{enabled===undefined&&<div className="notice" role={permissionError?'alert':'status'}><LockKeyhole size={17}/><span>{permissionError?'Write access could not be checked. Retry loading generations before saving.':'Checking write access…'}</span></div>}{enabled===false&&<div className="notice"><LockKeyhole size={17}/><span>Read-only mode. Writes require the reviewed SQL setup and explicit approval.</span></div>}{!plan&&<label>Generation ID<input value={generationId||''} readOnly placeholder="Choose a generation from the list" required/></label>}<label>Title <span>Up to 100 characters</span><input name="title" defaultValue={plan?.title} maxLength={100} required/></label><label>Description <span>Up to 280 characters</span><textarea name="description" defaultValue={plan?.description} maxLength={280} rows={4} required/></label><label>SAGE Note <span>Why it fits · up to 350 characters</span><textarea name="why_it_fits" defaultValue={plan?.why_it_fits} maxLength={350} rows={5} required/></label>{!plan&&<><div className="form-section-title">02 · The place</div><label>Place name<input name="place_name" maxLength={300} required/></label><label>Google place ID<input name="place_id" maxLength={300} required/></label><label>Address<input name="address" maxLength={500}/></label><label>Place URL <span>HTTPS only</span><input name="place_url" type="url" maxLength={2000}/></label><div className="form-grid"><label>Rating<input name="rating" type="number" min="0" max="5" step="0.1"/></label><label>Review count<input name="review_count" type="number" min="0" max="2147483647" step="1"/></label><label>Price level<input name="price_level" type="number" min="0" max="4" step="1"/></label><label>Latitude<input name="latitude" type="number" min="-90" max="90" step="any"/></label><label>Longitude<input name="longitude" type="number" min="-180" max="180" step="any"/></label></div><label>Place types <span>Comma-separated original Google types</span><input name="place_types" placeholder="cafe, coffee_shop"/></label><p className="small muted">Leave unknown optional values blank. Supply coordinates as a pair. Do not invent ratings, locations, or generation provenance.</p></>}{saved&&<p role="status" className="success">Recommendation saved.</p>}{message&&<p role={success?'status':'alert'} className={success?'success':'error-message'}>{message}</p>}<button disabled={pending||enabled!==true||(!plan&&!generationId)}><Save size={16}/>{pending?'Saving…':plan?'Save changes':'Create recommendation'}</button></form>;
}
function DeletePanel({plan,dependencies,enabled}:{plan:Plan;dependencies:{votes:number;saves:number};enabled:boolean}) {
  const router=useRouter(),[open,setOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
  const blocked=dependencies.votes>0||dependencies.saves>0;
  async function remove(event:React.FormEvent) {
    event.preventDefault();setPending(true);setError('');
    try {await mutate(`/api/admin/recommendations/${plan.id}`,'DELETE',{confirmation});router.push('/recommendations');}
    catch(e) {setError(e instanceof Error?e.message:'Unable to delete.');setPending(false);}
  }
  return <section className="panel danger-panel"><h2>Delete recommendation</h2><p>{dependencies.votes} votes · {dependencies.saves} saved places</p><p className="small">{blocked?'Deletion is blocked to preserve community feedback and bookmarks.':'This permanently removes only the recommendation. Its generation is retained. Dependencies are checked again inside a database transaction.'}</p>{!open?<button className="danger" disabled={blocked||!enabled} onClick={()=>setOpen(true)}><Trash2 size={15}/>Review deletion</button>:<form onSubmit={remove} className="editor-form"><p><strong>Delete “{plan.title}” permanently?</strong></p><label>Type DELETE to confirm<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>{error&&<p role="alert" className="error-message">{error}</p>}<button className="danger" disabled={confirmation!=='DELETE'||pending}>{pending?'Deleting…':'Permanently delete'}</button><button type="button" className="secondary" disabled={pending} onClick={()=>{setOpen(false);setConfirmation('');}}>Cancel</button></form>}</section>;
}

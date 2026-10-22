'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { domains, type DomainRow, type Field, valueText } from '@/lib/domain';
import { useData, Status, PageHeading, Pager, Empty, date } from './ui';
import { ImageEditor } from './image-editor';
export type DomainResult={row?:DomainRow;rows:DomainRow[];total:number;page:number;writesEnabled:boolean};
export async function domainMutation(url:string,method:string,body:unknown) {
  const multipart=body instanceof FormData;
  const response=await fetch(url,{method,headers:multipart?undefined:{'Content-Type':'application/json'},body:multipart?body:JSON.stringify(body)});
  let result;
  try {result=await response.json();} catch {throw new Error('The operation was not confirmed. Reload the list before retrying.');}
  if(!response.ok) throw new Error(result.error||'The operation was not confirmed.');
  return result;
}
export function WriteNotice({enabled}:{enabled:boolean}) {return !enabled?<p className="notice">Read-only mode. Writes are disabled pending approval.</p>:null;}
export function DomainPanel({resource,id}:{resource:string;id?:string}) {
  const params=useSearchParams();
  return id?<DomainDetail key={`${resource}/${id}`} resource={resource} id={id}/>:<DomainList key={`${resource}/${params.get('filter')||''}`} resource={resource} filter={params.get('filter')||undefined}/>;
}
export function DomainList({resource,filter,embedded=false}:{resource:string;filter?:string;embedded?:boolean}) {
  const d=domains[resource];const [page,setPage]=useState(1),[q,setQ]=useState(''),[draft,setDraft]=useState(''),[sort,setSort]=useState('newest');
  const params=new URLSearchParams({page:String(page),q,sort,...(filter?{filter}:{})});
  const {data,error,reload}=useData<DomainResult>(`/api/admin/${resource}?${params}`);
  const heading=<>{!embedded?<PageHeading eyebrow="SAGE DOMAIN WORKSPACE" title={d.title} description={d.description}>{d.writable&&<Link className="button" href={`/${resource}/new`}>{resource==='images'?'Upload image':'New record'}</Link>}{resource==='chains'&&<Link className="button secondary" href="/mix">Edit chain mix</Link>}</PageHeading>:<h2>{d.title}</h2>}</>;
  return <>{heading}<section className="panel records-panel">{filter&&<p className="small muted">Related records only · <Link className="text-link" href={`/${resource}`}>View all</Link></p>}
    <div className="filters"><form className="search" onSubmit={e=>{e.preventDefault();setQ(draft);setPage(1);}}><input aria-label={`Search ${d.title}`} placeholder={d.search?'Search records…':'Find by full record UUID…'} maxLength={100} value={draft} onChange={e=>setDraft(e.target.value)}/><button className="secondary">Search</button></form><select aria-label={`Sort ${d.title}`} value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
    {!data?<Status error={error} reload={reload}/>:<><WriteNotice enabled={data.writesEnabled}/>{!data.rows.length?<Empty title="No records found">No matching records are stored. No sample records have been created.</Empty>:<div className="table-scroll"><table><thead><tr>{d.columns.map(k=><th key={k}>{d.fields.find(f=>f.key===k)?.label||k}</th>)}<th>Created (UTC)</th><th>Open</th></tr></thead><tbody>{data.rows.map(row=><tr key={row.id}>{d.columns.map((k,i)=><td key={k}>{i===0?<Link href={`/${resource}/${row.id}`}>{valueText(row[k]).slice(0,180)}</Link>:<span className="cell-note">{valueText(row[k])}</span>}</td>)}<td>{row.created_at ? date(row.created_at) : '—'}</td><td><Link href={`/${resource}/${row.id}`} aria-label={`Open ${valueText(row[d.label]).slice(0,100)}`}>View →</Link></td></tr>)}</tbody></table></div>}<Pager page={page} total={data.total} setPage={setPage}/></>}
  </section></>;
}
function DomainDetail({resource,id}:{resource:string;id:string}) {
  const d=domains[resource],isNew=id==='new';
  const {data,error,reload}=useData<DomainResult>(`/api/admin/${resource}${isNew?'?page=1':`/${id}`}`);
  const [saved,setSaved]=useState(false);
  const row=data?.row;
  return <><Link className="back" href={`/${resource}`}>← All {d.title.toLowerCase()}</Link><PageHeading eyebrow={isNew?'NEW RECORD':'RECORD DETAILS'} title={isNew?(resource==='images'?'Upload image':`New ${d.title.toLowerCase()} record`):d.title} description={d.description}/>
    {!data?<Status error={error} reload={reload}/>:<><WriteNotice enabled={data.writesEnabled}/>{saved&&<p className="success" role="status">Saved. Showing the latest stored record.</p>}
    {resource==='images'?<ImageEditor key={`${id}:${row?.revision||0}`} row={row} enabled={data.writesEnabled} reload={()=>{setSaved(true);reload();}}/>:d.writable?<section className="panel"><CatalogForm key={`${id}:${row?.revision||0}`} resource={resource} row={row} enabled={data.writesEnabled} onSaved={()=>{setSaved(true);reload();}} onStart={()=>setSaved(false)}/></section>:row&&<section className="panel"><dl className="domain-details">{d.fields.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.relation&&row[f.key]?<Link className="text-link" href={`/${f.relation}/${row[f.key]}`}>{valueText(row[f.key])}</Link>:<pre>{row[f.key]==null&&['uploaded_by','imported_by'].includes(f.key)?'Unavailable account':row[f.key]==null&&f.key==='generation_id'?'No linked SAGE request':valueText(row[f.key])}</pre>}</dd></div>)}</dl>{resource==='media'&&<Link className="button secondary" href={`/recommendations/${id}`}>Open recommendation editor</Link>}</section>}
    {row&&<section className="panel"><h2>Record information</h2><dl><dt>ID</dt><dd><code>{row.id}</code></dd><dt>Created (UTC)</dt><dd>{row.created_at ? date(row.created_at) : '—'}</dd>{row.revision!=null&&<><dt>Revision</dt><dd>{row.revision}</dd></>}</dl></section>}
    {row&&d.writable&&resource!=='images'&&<DeleteRecord resource={resource} row={row} enabled={data.writesEnabled}/>}
    {row&&resource==='chains'&&<DomainList key={row.id} resource="steps" filter={row.id} embedded/>}
    {row&&resource==='requests'&&<><DomainList resource="media" filter={row.id} embedded/><DomainList resource="responses" filter={row.id} embedded/></>}
    </>}
  </>;
}
function CatalogForm({resource,row,enabled,onSaved,onStart}:{resource:string;row?:DomainRow;enabled:boolean;onSaved:()=>void;onStart:()=>void}) {
  const router=useRouter();const [pending,setPending]=useState(false),[error,setError]=useState('');const d=domains[resource];
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();if(!enabled||pending)return;setPending(true);setError('');onStart();
    const form=new FormData(e.currentTarget);const body:Record<string,unknown>={};
    for(const f of d.fields) body[f.key]=f.type==='boolean'?form.get(f.key)==='on':f.optional&&form.get(f.key)===''?null:form.get(f.key);
    if(row)body.revision=row.revision;
    try {const result=await domainMutation(`/api/admin/${resource}${row?`/${row.id}`:''}`,row?'PATCH':'POST',body);if(row)onSaved();else router.push(`/${resource}/${result.id}`);} catch(e) {setError(e instanceof Error?e.message:'Save failed.');} finally {setPending(false);}
  }
  return <form className="editor-form" onSubmit={submit}><fieldset disabled={!enabled||pending}>{d.fields.map(f=><div className="domain-field" key={f.key}>{f.relation?<RelationField field={f} initial={row?.[f.key] as string|undefined}/>:<label>{f.label}{f.type==='boolean'?<input className="domain-checkbox" type="checkbox" name={f.key} defaultChecked={row?row[f.key]===true:true}/>:f.type==='textarea'?<textarea name={f.key} rows={5} maxLength={f.max} required={!f.optional} defaultValue={row?String(row[f.key]??''):''}/>:<input name={f.key} type={f.type==='url'?'url':f.type==='email'?'email':'text'} maxLength={f.max} required={!f.optional} defaultValue={row?String(row[f.key]??''):''}/>}</label>}</div>)}</fieldset>{error&&<p className="error-message" role="alert">{error}</p>}<button disabled={!enabled||pending}>{pending?'Saving…':row?'Save changes':'Create record'}</button></form>;
}
function RelationField({field,initial}:{field:Field;initial?:string}) {
  const [value,setValue]=useState(initial||''),[q,setQ]=useState(''),[draft,setDraft]=useState(''),[page,setPage]=useState(1);
  const d=domains[field.relation!];const {data,error,reload}=useData<DomainResult>(`/api/admin/${field.relation}?${new URLSearchParams({q,page:String(page)})}`);
  return <div className="relation-picker"><label>{field.label}<select name={field.key} value={value} required={!field.optional} onChange={e=>setValue(e.target.value)}><option value="">{field.optional?'No linked record':'Choose a record'}</option>{value&&!data?.rows.some(r=>r.id===value)&&<option value={value}>Selected: {value}</option>}{data?.rows.map(r=><option key={r.id} value={r.id}>{valueText(r[d.label]).slice(0,80)} · {r.id}</option>)}</select></label><div className="search"><input aria-label={`Find ${field.label}`} placeholder={d.search?'Search choices…':'Find by UUID…'} value={draft} onChange={e=>setDraft(e.target.value)}/><button className="secondary" type="button" onClick={()=>{setPage(1);setQ(draft);}}>Find</button></div>{!data?<Status error={error} reload={reload}/>:<Pager page={page} total={data.total} setPage={setPage}/>}</div>;
}
export function DeleteRecord({resource,row,enabled,onDelete}:{resource:string;row:DomainRow;enabled:boolean;onDelete?:()=>void}) {
  const router=useRouter();const [confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
  async function remove(e:React.FormEvent) {e.preventDefault();if(!enabled||pending||confirmation!=='DELETE')return;setPending(true);setError('');try {await domainMutation(`/api/admin/${resource}/${row.id}`,'DELETE',{revision:row.revision,confirmation});if(onDelete)onDelete();else router.push(`/${resource}`);}catch(e){setError(e instanceof Error?e.message:'Deletion failed.');}finally{setPending(false);}}
  return <section className="panel danger-panel"><h2>Delete record</h2><p>Permanently delete “{valueText(row[domains[resource].label])}”? Referenced catalog records cannot be deleted. Image deletion also removes its private file.</p><form className="editor-form" onSubmit={remove}><label>Type DELETE to confirm<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>{error&&<p role="alert" className="error-message">{error}</p>}<button className="danger" disabled={!enabled||pending||confirmation!=='DELETE'}>{pending?'Deleting…':'Permanently delete'}</button></form></section>;
}

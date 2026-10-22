'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DomainRow } from '@/lib/domain';
import { DeleteRecord, domainMutation } from './domain-panel';
export function ImageEditor({row,enabled,reload}:{row?:DomainRow;enabled:boolean;reload:()=>void}) {
  const router=useRouter();const [pending,setPending]=useState(false),[error,setError]=useState(''),[previewError,setPreviewError]=useState(false);
  const ready=row?.status==='ready';
  async function save(e:React.FormEvent<HTMLFormElement>,replace=false) {
    e.preventDefault();if(!enabled||pending)return;const form=new FormData(e.currentTarget);setPending(true);setError('');
    try {
      let result;
      if(!row||replace) {if(row)form.set('revision',String(row.revision));result=await domainMutation(`/api/admin/images${row?`/${row.id}/replace`:''}`,'POST',form);}
      else result=await domainMutation(`/api/admin/images/${row.id}`,'PATCH',{title:form.get('title'),alt_text:form.get('alt_text'),revision:row.revision});
      if(row)reload();else router.push(`/images/${result.id}`);
    } catch(e) {setError(e instanceof Error?e.message:'Image operation was not confirmed.');} finally {setPending(false);}
  }
  async function recover() {
    if(!row||!enabled||pending)return;setPending(true);setError('');
    try {await domainMutation(`/api/admin/images/${row.id}/recover`,'POST',{revision:row.revision});reload();}catch(e){setError(e instanceof Error?e.message:'Recovery was not confirmed.');}finally{setPending(false);}
  }
  return <>{row&&<section className="panel"><h2>Private image</h2>{ready?(previewError?<p role="alert">Preview could not be loaded. Reload to retry.</p>:
    // Protected same-origin endpoint verifies the current session on every request.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="private-image" src={`/api/admin/images/${row.id}/content?revision=${row.revision}`} alt={String(row.alt_text||'')} onError={()=>setPreviewError(true)}/>):<p className="notice">Status: {String(row.status)}. An operation may still be in progress. If it remains incomplete for ten minutes, reload and recover a replacement or delete the incomplete record.</p>}
    <dl><dt>Uploaded by</dt><dd>{row.uploaded_by?String(row.uploaded_by):'Unavailable account'}</dd><dt>Dimensions / file size</dt><dd>{String(row.width)} × {String(row.height)} · {String(row.byte_size)} bytes</dd></dl>
    {!ready&&<button className="secondary" onClick={reload} disabled={pending}>Reload status</button>}{row.status==='replacing'&&<button onClick={recover} disabled={!enabled||pending}>Recover replacement</button>}
  </section>}
  {(!row||ready)&&<section className="panel"><h2>{row?'Edit image details':'Upload an image'}</h2><form className="editor-form" onSubmit={e=>save(e)}><fieldset disabled={!enabled||pending}><label>Title<input name="title" required maxLength={160} defaultValue={String(row?.title||'')}/></label><label>Alternative text<input name="alt_text" maxLength={2000} defaultValue={String(row?.alt_text||'')}/></label>{!row&&<label>Image file<input name="file" type="file" required accept="image/jpeg,image/png,image/webp"/><span>JPEG, PNG or WebP, up to 5 MiB. Images are normalized to WebP with metadata removed.</span></label>}</fieldset><button disabled={!enabled||pending}>{pending?'Working…':row?'Save image details':'Upload image'}</button></form></section>}
  {row&&ready&&<section className="panel"><h2>Replace image file</h2><p className="small muted">A new private file replaces this image; its title and alternative text are retained.</p><form className="editor-form" onSubmit={e=>save(e,true)}><input type="hidden" name="title" value={String(row.title)}/><input type="hidden" name="alt_text" value={String(row.alt_text||'')}/><label>Replacement file<input name="file" type="file" required accept="image/jpeg,image/png,image/webp" disabled={!enabled||pending}/></label><button disabled={!enabled||pending}>Replace file</button></form></section>}
  {error&&<p role="alert" className="error-message">{error}</p>}{row&&<DeleteRecord key={row.revision} resource="images" row={row} enabled={enabled&&!pending}/>}
  </>;
}

'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { DomainRow } from '@/lib/domain';
import { useData, Status, PageHeading, Empty } from './ui';
import { domainMutation, WriteNotice } from './domain-panel';
export function ChainMix() {
  const {data,error,reload}=useData<{rows:DomainRow[];writesEnabled:boolean}>('/api/admin/mix');const [saved,setSaved]=useState(false);
  return <><PageHeading eyebrow="PROMPT CONFIGURATION" title="Prompt chain mix" description="Relative selection weights across chain versions. Zero excludes a chain. This saved configuration does not change the existing SAGE generation pipeline."/>{saved&&<p className="success" role="status">Mix saved. Showing the latest configuration.</p>}{!data?<Status error={error} reload={reload}/>:<><WriteNotice enabled={data.writesEnabled}/>{data.rows.length?<MixForm key={JSON.stringify(data.rows)} rows={data.rows} enabled={data.writesEnabled} onSaved={()=>{setSaved(true);reload();}}/>:<Empty title="No prompt chains yet">Approved prompt chains and steps must be provisioned before a mix can be edited.</Empty>}<button className="secondary" onClick={()=>{setSaved(false);reload();}}>Reload stored mix</button></>}</>;
}
function MixForm({rows,enabled,onSaved}:{rows:DomainRow[];enabled:boolean;onSaved:()=>void}) {
  const [weights,setWeights]=useState(rows.map(r=>String(r.mix_weight))),[pending,setPending]=useState(false),[error,setError]=useState('');
  const total=weights.reduce((sum,w)=>sum+(Number(w)||0),0);
  async function save(e:React.FormEvent) {e.preventDefault();if(!enabled||pending)return;setPending(true);setError('');try {await domainMutation('/api/admin/mix','PATCH',{changes:rows.map((r,i)=>({id:r.id,revision:r.revision,weight:Number(weights[i])}))});onSaved();}catch(e){setError(e instanceof Error?e.message:'Mix save failed.');}finally{setPending(false);}}
  return <form className="panel editor-form" onSubmit={save}><div className="table-scroll"><table><thead><tr><th>Chain</th><th>Weight</th><th>Share</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.id}><td><Link href={`/chains/${r.id}`}>{String(r.name)} · v{String(r.version)}</Link></td><td><input aria-label={`Weight for ${r.name} version ${r.version}`} type="number" min={0} max={10000} step={1} required value={weights[i]} disabled={!enabled||pending} onChange={e=>setWeights(weights.map((w,j)=>i===j?e.target.value:w))}/></td><td>{total?`${((Number(weights[i])||0)/total*100).toFixed(1)}%`:'—'}</td></tr>)}</tbody></table></div>{!total&&<p className="notice">No active mix: all weights are zero.</p>}{error&&<p className="error-message" role="alert">{error}</p>}<button disabled={!enabled||pending}>{pending?'Saving…':'Save mix'}</button></form>;
}

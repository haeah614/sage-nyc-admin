"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Search, ArrowLeft, ArrowRight } from 'lucide-react';
export const number = (n:number) => n.toLocaleString('en-US');
export const date = (s:string) => new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
export function useData<T>(url:string) {
  const router = useRouter();
  const [state,setState] = useState<{url:string;data?:T;error?:string}>({url:''});
  const [version,setVersion] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    fetch(url,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if (response.status===401) { router.replace('/login'); return; }
      if (response.status===403) { router.replace('/denied'); return; }
      const data = await response.json(); if (!response.ok) throw new Error(data.error||'Unable to load data.');
      setState({url,data});
    }).catch(error=>{ if (!controller.signal.aborted) setState({url,error:error.message}); });
    return ()=>controller.abort();
  },[url,version,router]);
  return {data:state.url===url?state.data:undefined,error:state.url===url?state.error:undefined,reload:()=>{setState({url:''});setVersion(v=>v+1);}};
}
export function Status({error,reload}:{error?:string;reload:()=>void}) {
  return error ? <div className="empty" role="alert"><AlertCircle/><h2>We couldn’t load this view</h2><p>{error}</p><button onClick={reload}><RefreshCw size={16}/>Try again</button></div> : <div className="loading" role="status"><div className="skeleton"/><div className="skeleton"/><p>Loading your live workspace…</p></div>;
}
export function Empty({title='Nothing here yet',children}:{title?:string;children?:React.ReactNode}) { return <div className="empty"><Search size={28}/><h2>{title}</h2><p>{children||'Try a different search, or return when your community has more activity.'}</p></div>; }
export function PageHeading({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children?:React.ReactNode}) { return <header className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</header>; }
export function Pager({page,total,setPage}:{page:number;total:number;setPage:(n:number)=>void}) { const pages = Math.max(1,Math.ceil(total/25)); return <div className="pagination"><span>{number(total)} records · Page {page} of {pages}</span><div><button className="secondary" disabled={page<=1} onClick={()=>setPage(page-1)}><ArrowLeft size={16}/>Previous</button><button className="secondary" disabled={page>=pages} onClick={()=>setPage(page+1)}>Next<ArrowRight size={16}/></button></div></div>; }
export function Back() { return <Link className="back" href="/recommendations"><ArrowLeft size={16}/>All recommendations</Link>; }
export function Metric({label,value,detail,icon}:{label:string;value:string;detail:string;icon:React.ReactNode}) { return <article className="metric"><div><span>{label}</span>{icon}</div><strong>{value}</strong><small>{detail}</small></article>; }

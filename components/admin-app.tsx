"use client";
import Link from 'next/link';
import { LayoutDashboard, Users, Sparkles, ThumbsUp, Sprout, ShieldCheck, LogOut, ArrowUpRight } from 'lucide-react';
import { Overview } from './overview';
import { Records } from './records';
import { RecommendationEditor } from './recommendation-editor';
const nav = [{href:'/',label:'Overview',icon:LayoutDashboard},{href:'/users',label:'Community',icon:Users},{href:'/recommendations',label:'Recommendations',icon:Sparkles},{href:'/votes',label:'Votes & ratings',icon:ThumbsUp}];
export function AdminApp({section}:{section:string[]}) {
  const current = section[0]||'';
  return <div className="workspace"><a href="#main" className="skip">Skip to content</a><aside className="sidebar"><Link href="/" className="brand"><Sprout size={27}/><span>SAGE <i>NYC</i><small>ADMIN WORKSPACE</small></span></Link><div className="nav-label">WORKSPACE</div><nav aria-label="Main navigation">{nav.map(({href,label,icon:Icon})=><Link key={href} href={href} aria-current={(href==='/'?!current:href===`/${current}`)?'page':undefined}><Icon size={18}/>{label}</Link>)}</nav><div className="sidebar-note"><span className="spark">✳</span><h3>Room to grow.</h3><p>A clearer view of the people and places shaping SAGE.</p></div><div className="sidebar-bottom"><a href="https://hello-world-haeah614.vercel.app" target="_blank" rel="noreferrer">Visit SAGE NYC<ArrowUpRight size={16}/></a><form method="post" action="/auth/signout"><button><LogOut size={16}/>Sign out</button></form></div></aside><div className="main-wrap"><div className="topbar"><span>SAGE NYC <span className="slash">/</span> Administration</span><span className="verified"><ShieldCheck size={15}/>Superadmin workspace</span></div><main id="main" tabIndex={-1}>{!current?<Overview/>:current==='recommendations'&&section[1]?<RecommendationEditor id={section[1]}/>:<Records kind={current as 'users'|'recommendations'|'votes'}/>}</main><footer>Thoughtfully curated. Authenticated by Google. <span>SAGE NYC · Week 06</span></footer></div></div>;
}

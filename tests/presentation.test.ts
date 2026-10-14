import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { it,expect,vi } from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
vi.mock('../components/ui',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('../components/ui')>();
 const plans=Array.from({length:6},(_,i)=>({id:`fixture-${i}`,title:['An afternoon among the galleries','A quiet corner for coffee','A walk by the Hudson','A new neighborhood favorite','A little garden escape','An evening of independent cinema'][i],place_name:['Gallery fixture','Café fixture','Riverside fixture','Restaurant fixture','Garden fixture','Cinema fixture'][i],rating:4.5,review_count:10,created_at:'2026-10-14T12:00:00Z'}));
 return {...actual,useData:()=>({data:{users:12,plans:6,generations:3,positive:24,negative:6,recent:plans,trend:Array.from({length:30},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,positive:i%6,negative:i%3})),categories:[{label:'cafe',count:3},{label:'park',count:2},{label:'museum',count:1}],places:plans.slice(0,5).map((p,i)=>({label:p.place_name,count:6-i})),popular:plans.slice(0,5).map((p,i)=>({...p,positive:8-i,negative:i%2})),scannedPlans:6,scannedVotes:30,sampled:false,asOf:'2026-10-14T12:00:00Z'},reload:vi.fn()})};
});
import { AdminApp } from '../components/admin-app';
it('renders an accessible overview using isolated synthetic fixtures for visual review',()=>{
 const body=renderToStaticMarkup(createElement(AdminApp,{section:[]}));
 expect(body).toContain('View accessible chart data');expect(body).toContain('Skip to content');expect(body).toContain('The bigger picture.');
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const dir=new URL('../.artifacts/',import.meta.url);mkdirSync(dir,{recursive:true});
 writeFileSync(new URL('overview-fixture.html',dir),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TEST FIXTURE — isolated visual review</title><style>${css}</style></head><body><div style="background:#f2eacb;text-align:center;font:12px system-ui;padding:6px">ISOLATED TEST FIXTURE · Synthetic data · Not a production route</div>${body}</body></html>`);
});

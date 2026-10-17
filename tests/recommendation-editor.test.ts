import { build } from 'esbuild';
import { chromium, type Browser, type Page, type Route } from 'playwright-core';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';

// Mount the actual components/hooks in an isolated browser. All requests are
// intercepted; no Next server, credentials, or live database are involved.
let browser: Browser;
let bundle: string;
const pages: Page[]=[];
const originalTitle='A6 TEMP CRUD TEST 20261016 01';
const plan={id:'fixture-plan',generation_id:'fixture-generation',user_id:'fixture-owner',title:originalTitle,description:'Synthetic description',why_it_fits:'Synthetic note',place_id:'fixture-place',place_name:'Fixture venue',address:null,rating:null,review_count:null,price_level:null,place_url:null,place_types:[],latitude:null,longitude:null,created_at:'2026-10-16T12:00:00Z'};
const generation={id:'fixture-generation',user_id:'fixture-owner',provider:'fixture',model:'fixture-model',created_at:plan.created_at};
const json=(route:Route,data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
const details=(title=originalTitle)=>({plan:{...plan,title},dependencies:{votes:0,saves:0},writesEnabled:true});
const generations=(writesEnabled=true)=>({rows:[generation],total:1,page:1,writesEnabled});
async function eventually(check:()=>Promise<boolean>) {
 await expect.poll(check,{timeout:5000}).toBe(true);
}
beforeAll(async()=>{
 const output=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {RecommendationEditor} from './components/recommendation-editor'; createRoot(document.getElementById('root')).render(<RecommendationEditor id={location.pathname.slice(1)}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'isolated-next',setup(builder){
  builder.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture-next'}));
  builder.onLoad({filter:/.*/,namespace:'fixture-next'},args=>({loader:'js',contents:args.path==='next/navigation'?'const router={push(){},replace(){}}; export const useRouter=()=>router;':'export default function Link({children}) {return children;}'}));
 }}]});
 bundle=output.outputFiles[0].text;
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
},30000);
afterEach(async()=>{await Promise.all(pages.splice(0).map(page=>page.close()));});
afterAll(async()=>{await browser?.close();});
async function mount(id:string,handler:(route:Route)=>Promise<void>) {
 const page=await browser.newPage();pages.push(page);
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='http://editor.test') return route.abort();
  if(url.pathname.startsWith('/api/admin/')) return handler(route);
  if(url.pathname===`/${id}`) return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div>'});
  return route.abort();
 });
 await page.goto(`http://editor.test/${id}`);await page.addScriptTag({content:bundle});return page;
}
it('reloads the persisted title after PATCH and resets an already-open delete confirmation',async()=>{
 let title=originalTitle;let reads=0;let mutations=0;
 const page=await mount('fixture-plan',async route=>{
  if(route.request().method()==='PATCH') {mutations++;title=`${originalTitle} - UPDATED (persisted)`;return json(route,{id:plan.id});}
  reads++;return json(route,details(title));
 });
 await page.getByRole('button',{name:'Review deletion'}).click();
 await page.getByLabel('Type DELETE to confirm').fill('DELETE');
 await page.locator('input[name="title"]').fill(`${originalTitle} - UPDATED`);
 await page.getByRole('button',{name:'Save changes'}).click();
 await eventually(()=>page.getByRole('button',{name:'Review deletion'}).isVisible());
 expect(reads).toBe(2);expect(mutations).toBe(1);
 expect(await page.locator('input[name="title"]').inputValue()).toBe(title);
 expect(await page.getByText('Recommendation saved.',{exact:true}).isVisible()).toBe(true);
 await page.getByRole('button',{name:'Review deletion'}).click();
 expect(await page.locator('.danger-panel strong').textContent()).toBe(`Delete “${title}” permanently?`);
 expect(await page.getByLabel('Type DELETE to confirm').inputValue()).toBe('');
});
it('keeps the original persisted title after a failed save',async()=>{
 let reads=0;
 const page=await mount('fixture-plan',async route=>{
  if(route.request().method()==='PATCH') return json(route,{error:'Synthetic save failure'},503);
  reads++;return json(route,details());
 });
 await page.locator('input[name="title"]').fill('Unsaved draft');
 await page.getByRole('button',{name:'Save changes'}).click();
 await eventually(()=>page.getByText('Synthetic save failure').isVisible());
 await page.getByRole('button',{name:'Review deletion'}).click();
 expect(await page.locator('.danger-panel strong').textContent()).toBe(`Delete “${originalTitle}” permanently?`);
 expect(reads).toBe(1);
});
it('hides stale deletion controls if the post-save read fails and retries the read only',async()=>{
 let reads=0;let mutations=0;
 const page=await mount('fixture-plan',async route=>{
  if(route.request().method()==='PATCH') {mutations++;return json(route,{id:plan.id});}
  reads++;return reads===2?json(route,{error:'Synthetic refresh failure'},503):json(route,details(reads===1?originalTitle:'Persisted update'));
 });
 await page.getByRole('button',{name:'Save changes'}).click();
 await eventually(()=>page.getByText('Synthetic refresh failure').isVisible());
 expect(await page.locator('.danger-panel').count()).toBe(0);
 await page.getByRole('button',{name:'Try again'}).click();
 await page.getByRole('button',{name:'Review deletion'}).click();
 expect(await page.locator('.danger-panel strong').textContent()).toBe('Delete “Persisted update” permanently?');
 expect(mutations).toBe(1);
});
it.each([true,false])('distinguishes initial unknown permission from actual writesEnabled=%s',async enabled=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const page=await mount('new',async route=>{await gate;return json(route,generations(enabled));});
 await eventually(()=>page.getByText('Checking write access…').isVisible());
 expect(await page.getByText('Read-only mode.',{exact:false}).count()).toBe(0);
 expect(await page.getByRole('button',{name:'Create recommendation'}).isDisabled()).toBe(true);
 release();await page.getByRole('radio').check();
 expect(await page.getByRole('button',{name:'Create recommendation'}).isDisabled()).toBe(!enabled);
 expect(await page.getByText('Read-only mode.',{exact:false}).count()).toBe(enabled?0:1);
});
it('preserves drafts and disables saving during search without a read-only flash',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const page=await mount('new',async route=>{
  if(new URL(route.request().url()).searchParams.get('q')) await gate;
  return json(route,generations());
 });
 await page.getByRole('radio').check();
 await page.locator('input[name="title"]').fill('Preserved draft');
 await page.getByLabel('Find generation by UUID').fill(generation.id);
 await page.getByRole('button',{name:'Find',exact:true}).click();
 await eventually(()=>page.getByText('Checking write access…').isVisible());
 expect(await page.getByText('Read-only mode.',{exact:false}).count()).toBe(0);
 expect(await page.getByRole('button',{name:'Create recommendation'}).isDisabled()).toBe(true);
 release();await eventually(async()=>!(await page.getByRole('button',{name:'Create recommendation'}).isDisabled()));
 expect(await page.locator('input[name="title"]').inputValue()).toBe('Preserved draft');
 expect(await page.getByText('Read-only mode.',{exact:false}).count()).toBe(0);
});
it('keeps writes disabled with a permission-loading error instead of claiming read-only mode',async()=>{
 const page=await mount('new',route=>json(route,{error:'Synthetic load failure'},503));
 await eventually(()=>page.getByText('Write access could not be checked.',{exact:false}).isVisible());
 expect(await page.getByRole('button',{name:'Create recommendation'}).isDisabled()).toBe(true);
 expect(await page.getByText('Read-only mode.',{exact:false}).count()).toBe(0);
});

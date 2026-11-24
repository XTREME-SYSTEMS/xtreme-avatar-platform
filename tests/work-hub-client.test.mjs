import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fixture } from './work-hub-fixture.mjs';

const source=readFileSync(new URL('../public/work-hub.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<8;i++)await tick();}
function harness(fetchOverride){
 const f=fixture(),handlers=new Map(),events=new Map(),calls=[],root={innerHTML:'',replaceChildren(){this.innerHTML='';}};let confirmations=true;
 const window={addEventListener(t,fn){events.set(t,[...(events.get(t)||[]),fn]);},dispatchEvent(e){for(const fn of events.get(e.type)||[])fn(e);return true;}};
 const account={locked:false,user:{id:'alice'},invalidate(){this.locked=true;this.user=null;window.dispatchEvent(new Event('xtreme:account-ended'));}};window.XtremeAccount=account;
 const document={addEventListener(t,fn){handlers.set(t,[...(handlers.get(t)||[]),fn]);},querySelector(s){if(s==='#work-hub-root')return root;if(s==='#hub-editor input')return {focus(){}};return null;}};
 const fetcher=async(path,options)=>{calls.push({path,options});if(fetchOverride)return fetchOverride(path,options,calls.length);const input=options.body?JSON.parse(options.body):undefined;return f.raw(account.user?.id,path,input,options.headers);};
 vm.runInNewContext(source,{window,document,fetch:fetcher,URL,Date,Event,AbortController,setTimeout,clearTimeout,structuredClone,crypto:webcrypto,confirm:()=>confirmations});
 const render=(m='projects')=>{root.innerHTML=window.XtremeWorkHub.render(m);window.XtremeWorkHub.activate(m);return root.innerHTML;};
 const click=(action,id)=>{for(const fn of handlers.get('click')||[])fn({preventDefault(){},target:{closest:()=>({dataset:{workhub:action,id}})}});};
 const type=(key,value)=>{for(const fn of handlers.get('input')||[])fn({target:{dataset:{hubField:key},value}});};
 const submit=()=>{for(const fn of handlers.get('submit')||[])fn({preventDefault(){},target:{id:'hub-editor'}});};
 return {f,window,account,root,calls,render,click,type,submit,confirm(value){confirmations=value;},hasUnsaved:()=>window.XtremeWorkHub.hasUnsaved()};
}
test('client-to-server flow creates, edits, refreshes and explicitly deletes a private job',async()=>{
 const h=harness();h.render();await settle();h.click('new-job');h.type('name','Polished lobby');h.type('client','Client A');h.submit();h.submit();await settle();
 assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);assert.match(h.root.innerHTML,/Polished lobby/);assert.equal(h.hasUnsaved(),false);
 const id=(await h.f.request('alice')).body.jobs[0].id;h.click('edit-job',id);h.type('name','Polished lobby revised');h.submit();await settle();assert.match(h.root.innerHTML,/Polished lobby revised/);
 h.confirm(false);h.click('delete-job',id);await settle();assert.equal((await h.f.request('alice')).body.jobs.length,1);
 h.confirm(true);h.click('delete-job',id);await settle();assert.equal((await h.f.request('alice')).body.jobs.length,0);assert.equal((await h.f.request('bob')).body.jobs.length,0);
});
test('draft survives internal route changes and refresh until explicitly discarded',async()=>{
 const h=harness();h.render();await settle();h.click('new-result');h.type('title','Private unsaved estimate');h.type('text','Keep these quantities');h.render('briefing');h.render('results');
 assert.match(h.root.innerHTML,/Private unsaved estimate/);assert.equal(h.hasUnsaved(),true);h.click('refresh');await settle();assert.match(h.root.innerHTML,/Keep these quantities/);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);
 h.confirm(false);h.click('cancel');assert.equal(h.hasUnsaved(),true);h.confirm(true);h.click('cancel');assert.equal(h.hasUnsaved(),false);
});
test('failed initial read does not retry on every re-render',async()=>{
 const h=harness(async()=>new Response(JSON.stringify({error:'Offline'}),{status:503}));h.render();await settle();for(let i=0;i<10;i++)h.render();await settle();assert.equal(h.calls.length,1);assert.match(h.root.innerHTML,/Offline/);h.click('refresh');await settle();assert.equal(h.calls.length,2);
});
test('conflict keeps draft and requires explicit refresh before any retry',async()=>{
 const h=harness();h.render();await settle();
 await h.f.request('alice','/api/work-hub/jobs',{action:'create',version:0,id:'other-tab',data:{name:'Another tab',client:'',location:'',stage:'lead',dueDate:'',notes:'',links:[]}});
 h.click('new-job');h.type('name','Preserve this draft');h.submit();await settle();assert.match(h.root.innerHTML,/Preserve this draft/);assert.match(h.root.innerHTML,/Refresh before saving/);assert.equal(h.hasUnsaved(),true);
 h.submit();await settle();assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
 h.click('refresh');await settle();assert.match(h.root.innerHTML,/Preserve this draft/);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
 h.submit();await settle();assert.equal((await h.f.request('alice')).body.jobs.length,2);assert.equal(h.hasUnsaved(),false);
});
test('a late save acknowledgement cannot restore an ended account',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});let h;
 h=harness((path,options)=>options.method==='POST'?pending:h.f.raw('alice',path));h.render();await settle();h.click('new-job');h.type('name','Private late draft');h.submit();h.account.invalidate();resolve(new Response(JSON.stringify({saved:true,userId:'alice',id:'late',version:1})));await settle();assert.equal(h.root.innerHTML,'');assert.equal(h.hasUnsaved(),false);assert.equal(h.calls.length,2);
});
test('late response cannot repopulate state after account end',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const h=harness(()=>pending);h.render();h.account.invalidate();resolve(new Response(JSON.stringify({userId:'alice',version:1,jobs:[{name:'SECRET'}],results:[],briefing:{day:'2026-11-07'}})));await settle();assert.equal(h.root.innerHTML,'');assert.equal(h.hasUnsaved(),false);
});
test('untrusted stored text is escaped and unsafe stored links never become anchors',async()=>{
 const h=harness(async()=>new Response(JSON.stringify({userId:'alice',version:1,jobs:[],results:[{id:'r',title:'<img src=x onerror=alert(1)>',kind:'note',text:'<script>bad()</script>',links:[{label:'Unsafe',url:'javascript:alert(1)'},{label:'Public',url:'https://example.com/a'}],updatedAt:'2026-11-07'}],briefing:{day:'2026-11-07'}})));h.render('results');await settle();assert.match(h.root.innerHTML,/&lt;img/);assert.doesNotMatch(h.root.innerHTML,/<script>|href="javascript:/);assert.match(h.root.innerHTML,/href="https:\/\/example.com\/a"/);assert.match(h.root.innerHTML,/Saved by you/);assert.match(h.root.innerHTML,/Automatic delivery from agents is not connected/);
});

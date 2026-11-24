import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/assistant-actions.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const id='a7c541d7-178b-4a81-9b06-5fced79d721b',requestId='d0ed4320-96b7-4ecf-afcb-79fa7f923210';
const review=()=>({id,kind:'calendar_review',connectionRevision:3,review:{state:'review',requestId:id,reviewToken:'a'.repeat(43),expiresAt:new Date(Date.now()+300000).toISOString(),action:'create',eventId:null,eventRef:null,draft:{title:'Site walk',notes:'Bring plans',location:'Job site',start:'2026-11-09T14:00:00.000Z',end:'2026-11-09T15:00:00.000Z',allDay:false,timeZone:'America/New_York'},defaults:{visibility:'private',notifications:false,reminders:false}}});
function harness(){
 const events=new Map(),roots=[],timers=new Map(),reviews=[];let timer=0;
 class Node{
  constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners=new Map();this.text='';this.disabled=false;}
  setAttribute(key,value){this.attrs[key]=value;}
  append(...nodes){this.children.push(...nodes);}
  addEventListener(type,handler){this.listeners.set(type,handler);}
  remove(){const i=roots.indexOf(this);if(i>=0)roots.splice(i,1);this.removed=true;}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.text+this.children.map(node=>node.textContent).join(' ');}
  click(){return this.listeners.get('click')?.({target:this});}
 }
 const walk=node=>[node,...node.children.flatMap(walk)];
 const document={body:{append(node){roots.push(node);}},createElement:tag=>new Node(tag),querySelector:selector=>roots.flatMap(walk).find(node=>node.id===selector.slice(1))||null};
 const window={addEventListener(type,handler){events.set(type,[...(events.get(type)||[]),handler]);},dispatchEvent(event){for(const f of events.get(event.type)||[])f(event);},XtremeJobCalendar:{async showPreparedReview(value){reviews.push(value);return true;}}};
 const account={locked:false,user:{id:'member-a'},invalidate(){this.locked=true;window.dispatchEvent(new Event('xtreme:account-ended'));}};window.XtremeAccount=account;
 const location={hash:'#home'};
 vm.runInNewContext(source,{window,document,location,Event,Date,setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
 return {window,account,location,reviews,roots,api:window.XtremeAssistantActions,find:selector=>document.querySelector(selector),buttons:node=>walk(node).filter(n=>n.tag==='button')};
}
test('history receipt rendering is inert and uses text nodes without exposing review tokens',async()=>{
 const h=harness(),value=review();value.review.draft.title='<img src=x onerror=alert(1)>';
 const cards=h.api.render([value]);assert.equal(h.reviews.length,0);assert.equal(h.location.hash,'#home');assert.match(cards.textContent,/<img src=x/);assert.ok(!cards.textContent.includes(value.review.reviewToken));
 await h.buttons(cards)[0].click();assert.equal(h.reviews.length,1);assert.equal(h.reviews[0].connectionRevision,3);assert.equal(h.reviews[0].review.reviewToken,value.review.reviewToken);
});
test('only bounded known action shapes survive validation',()=>{
 const h=harness();
 for(const bad of [{id,kind:'execute',script:'alert(1)'},{id,kind:'navigate',screen:'https://evil.test'},{id,kind:'navigate',screen:'video'},{id,kind:'navigate',screen:'calls'}, {...review(),connectionRevision:0},{...review(),review:{...review().review,expiresAt:Date.now()/1000}},{...review(),review:{...review().review,requestId:'not-this-action'}},{...review(),review:{...review().review,defaults:{visibility:'public',notifications:true,reminders:true}}}])assert.equal(h.api.render([bad]).children.length,0);
 assert.equal(h.api.render(Array(13).fill({id,kind:'navigate',screen:'home'})).children.length,0);assert.equal(h.reviews.length,0);
});
test('fresh authenticated response context opens one allowed screen and status replays never navigate twice',()=>{
 const h=harness(),action={id,kind:'navigate',screen:'calendar'};
 h.api.receive([action],{source:'model',requestId,automatic:true});assert.equal(h.location.hash,'#home');
 h.api.receive([action],{source:'voice',requestId,automatic:true});assert.equal(h.location.hash,'#calendar');h.location.hash='#projects';h.api.receive([action],{source:'voice',requestId,automatic:true});assert.equal(h.location.hash,'#projects');
});
test('calendar receipt opens existing review only and cannot execute a write or replay automatic opening',async()=>{
 const h=harness();h.api.receive([review()],{source:'voice',requestId,automatic:true});await tick();assert.equal(h.reviews.length,1);
 h.api.receive([review()],{source:'voice',requestId,automatic:true});await tick();assert.equal(h.reviews.length,1);
 const expired=review();expired.id=expired.review.requestId='dc68c90a-d665-45d5-ab5e-f75a835037a3';expired.review.expiresAt=new Date(Date.now()-1).toISOString();h.api.receive([expired],{source:'chat',requestId,automatic:true});await tick();assert.equal(h.reviews.length,1);assert.match(h.find('#assistant-action-notice').textContent,/expired/);
});
test('saved receipts report saved work and open only their fixed work surface',async()=>{
 const h=harness(),value={id,kind:'saved',resource:'task',itemId:'task_123',title:'Review the permit'};
 h.api.receive([value],{source:'chat',requestId,automatic:true});assert.match(h.find('#assistant-action-notice').textContent,/Task saved/);assert.equal(h.location.hash,'#home');await h.buttons(h.api.render([value]))[0].click();assert.equal(h.location.hash,'#workspace');
 assert.ok(!h.find('#assistant-action-notice').textContent.includes('completed'));
});
test('account end or account switch clears visible receipts and blocks stale review buttons',async()=>{
 for(const action of ['end','switch']){
  const h=harness(),cards=h.api.render([review()]);h.api.receive([{id,kind:'saved',resource:'job',itemId:'job1',title:'Private job'}],{source:'chat',requestId,automatic:true});
  if(action==='end')h.window.dispatchEvent(new Event('xtreme:account-ended'));else h.account.user={id:'member-b'};
  await h.buttons(cards)[0].click();assert.equal(h.reviews.length,0);assert.equal(h.find('#assistant-action-notice'),null);assert.equal(h.api.render([review()]).children.length,0);
 }
});
test('missing calendar module keeps a truthful retry path without dropping the displayed review',async()=>{
 const h=harness();delete h.window.XtremeJobCalendar;const cards=h.api.render([review()]);await h.buttons(cards)[0].click();assert.match(h.find('#assistant-action-notice').textContent,/still loading/);assert.equal(h.buttons(cards)[0].disabled,false);
});

test('a voice review keeps a real retry button when Calendar loads late and status replays do not open it again',async()=>{
 const h=harness();delete h.window.XtremeJobCalendar;h.api.receive([review()],{source:'voice',requestId,automatic:true});await tick();const notice=h.find('#assistant-action-notice');assert.ok(h.buttons(notice).length);assert.ok(!notice.textContent.includes('a'.repeat(43)));
 h.api.receive([review()],{source:'voice',requestId,automatic:true});assert.equal(h.reviews.length,0);
 h.window.XtremeJobCalendar={async showPreparedReview(value){h.reviews.push(value);return true;}};await h.buttons(notice)[0].click();assert.equal(h.reviews.length,1);assert.equal(h.find('#assistant-action-notice'),null);
});

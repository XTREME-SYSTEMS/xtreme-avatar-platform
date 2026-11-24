import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/google-workspace.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const connection=(overrides={})=>({state:'connected',configured:true,account:{email:'calendar-user@example.com',displayName:'Calendar user'},revision:9,hasSavedConnection:true,services:[{id:'calendar',authorized:true,enabled:true},{id:'gmail',authorized:true,enabled:false}],...overrides});
const event=(overrides={})=>({id:'one',title:'Site meeting',start:'2026-11-08T15:00:00.000Z',end:'2026-11-08T16:00:00.000Z',allDay:false,location:'Office',...overrides});
const result=(events=[event()],overrides={})=>({state:'ready',timeZone:'America/New_York',rangeStart:'2026-11-07T12:00:00.000Z',rangeEnd:'2026-11-14T12:00:00.000Z',events,hasMore:false,...overrides});

function boot(handler=async path=>reply(path.endsWith('/calendar')?result():connection())){
 const documentHandlers=new Map(),windowHandlers=new Map(),nodes=new Map(),calls=[],htmlWrites=[],timers=new Map();let timerId=0;
 function element(tag='div'){
  const listeners=new Map(),slots=new Map();let markup='',textValue='';
  const node={tag,id:'',className:'',children:[],open:false,isConnected:true,focus(){},setAttribute(){},
   addEventListener(type,fn){listeners.set(type,fn);},
   querySelector(selector){if(selector==='[data-gw-calendar-results]')return slots.get(selector)||null;return {focus(){}};},
   showModal(){this.open=true;},close(){this.open=false;listeners.get('close')?.();},
   remove(){this.isConnected=false;nodes.delete('#'+this.id);},
   replaceChildren(...children){this.children=children;markup='';textValue='';slots.clear();},
   append(...children){this.children.push(...children);}
  };
  Object.defineProperty(node,'innerHTML',{get:()=>markup,set(value){markup=String(value);htmlWrites.push(markup);textValue='';node.children=[];slots.clear();if(markup.includes('data-gw-calendar-results'))slots.set('[data-gw-calendar-results]',element());}});
  Object.defineProperty(node,'textContent',{get:()=>textValue+node.children.map(child=>child.textContent??String(child)).join(' '),set(value){textValue=String(value);markup='';node.children=[];slots.clear();}});
  return node;
 }
 const account={user:{id:'member-one'},locked:false,invalidate(){this.locked=true;this.user=null;window.dispatchEvent(new Event('xtreme:account-ended'));}};
 const window={XtremeAccount:account,top:{location:{assign(){}}},addEventListener(type,fn){windowHandlers.set(type,[...(windowHandlers.get(type)||[]),fn]);},dispatchEvent(event){for(const fn of windowHandlers.get(event.type)||[])fn(event);}};
 const document={visibilityState:'visible',body:{append(el){nodes.set('#'+el.id,el);}},createElement:element,querySelector:selector=>nodes.get(selector)||null,addEventListener(type,fn){documentHandlers.set(type,[...(documentHandlers.get(type)||[]),fn]);}};
 for(const key of ['.connected-apps','#connected-app-list'])nodes.set(key,element());
 const location={hash:'#home',search:'',href:'https://app.example/#home'};
 const fetch=async(path,options)=>{calls.push({path,options});return path.startsWith('/api/call-desk-link/')?reply({status:'unlinked',linked:false}):handler(path,options);};
 vm.runInNewContext(source,{window,document,location,Event,URL,URLSearchParams,fetch,AbortController,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
 async function click(attr,value=''){
  const target={dataset:{[attr.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value},isConnected:true,focus(){},closest:selector=>selector==='['+attr+']'?target:null};
  for(const fn of documentHandlers.get('click')||[])fn({target,preventDefault(){}});
  await tick();
 }
 async function navigate(hash){location.hash=hash;window.dispatchEvent(new Event('hashchange'));await tick();}
 const dialog=()=>nodes.get('#connected-app-dialog');
 const view=()=>dialog()?.querySelector('[data-gw-calendar-results]');
 return {account,window,document,location,calls,htmlWrites,timers,click,navigate,dialog,view,readCalls:()=>calls.filter(call=>call.path.endsWith('/calendar')),open:async()=>{await navigate('#connections');await click('data-ca-app','google-workspace');},end:()=>account.invalidate()};
}

test('Calendar is opt-in and only a verified enabled read adapter exposes the action',async()=>{
 const h=boot();await h.open();
 assert.match(h.dialog().innerHTML,/View upcoming appointments/);assert.equal(h.readCalls().length,0);
 h.window.dispatchEvent(new Event('focus'));await tick();assert.equal(h.readCalls().length,0);
 for(const snapshot of [
  connection({services:[{id:'calendar',authorized:true,enabled:false}]}),
  connection({services:[{id:'calendar',authorized:false,enabled:false}]}),
  connection({state:'reconnect_required'}),
  {state:'setup_required',configured:false,account:null,revision:0,hasSavedConnection:false,services:[]}
 ]){
  const disabled=boot(async()=>reply(snapshot));await disabled.open();assert.doesNotMatch(disabled.dialog().innerHTML,/data-gw-calendar-read/);
  await disabled.click('data-gw-calendar-read');assert.equal(disabled.readCalls().length,0);
 }
});
test('one intentional read uses account and revision fences, GET, no-store, and renders only plain event fields',async()=>{
 const evil='<img src=x onerror=evil()>';
 const h=boot(async path=>reply(path.endsWith('/calendar')?result([event({title:evil,location:'<script>place</script>',description:'PRIVATE_DESCRIPTION',attendees:['PRIVATE_ATTENDEE'],htmlLink:'https://private.example/'})]):connection()));
 await h.open();await h.click('data-gw-calendar-read');
 const call=h.readCalls()[0];assert.equal(call.options.method,'GET');assert.equal(call.options.body,undefined);assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.cache,'no-store');
 assert.equal(call.options.headers['X-Xtreme-Account'],'member-one');assert.equal(call.options.headers['X-Xtreme-Connection-Revision'],'9');
 assert.match(h.view().textContent,/America\/New_York/);assert.ok(h.view().textContent.includes(evil));assert.ok(h.view().textContent.includes('<script>place</script>'));
 assert.ok(h.htmlWrites.every(html=>!html.includes(evil)&&!html.includes('<script>place</script>')));
 assert.doesNotMatch(h.view().textContent,/PRIVATE_DESCRIPTION|PRIVATE_ATTENDEE|private\.example/);
 assert.match(h.dialog().innerHTML,/Refresh appointments/);
});
test('all-day dates avoid timezone shifts and exclusive end dates while timed events show provider zone',async()=>{
 const h=boot(async path=>reply(path.endsWith('/calendar')?result([
  event({id:'all',title:'Delivery',start:'2026-11-09',end:'2026-11-10',allDay:true}),
  event({id:'multi',title:'Pour',start:'2026-11-10',end:'2026-11-12',allDay:true}),
  event({id:'timed'})
 ]):connection()));
 await h.open();await h.click('data-gw-calendar-read');const text=h.view().textContent;
 assert.match(text,/All day · Nov 9, 2026/);assert.match(text,/Nov 10, 2026 – Nov 11, 2026/);assert.doesNotMatch(text,/Nov 12, 2026/);
 assert.match(text,/10:00 AM/);assert.match(text,/11:00 AM/);assert.match(text,/America\/New_York/);
});
test('loading suppresses overlapping reads and shows honest empty or capped results',async()=>{
 const waiting=deferred();let loaded=false;
 const h=boot(async path=>path.endsWith('/calendar')?(loaded?reply(result([])):waiting.promise):reply(connection()));
 await h.open();await h.click('data-gw-calendar-read');await h.click('data-gw-calendar-read');
 assert.equal(h.readCalls().length,1);assert.match(h.view().textContent,/Loading appointments/);assert.match(h.dialog().innerHTML,/data-gw-calendar-read disabled/);
 waiting.resolve(reply(result(Array.from({length:25},(_,i)=>event({id:String(i)})),{hasMore:true})));await tick();
 assert.equal(h.view().children.find(node=>node.tag==='ul').children.length,25);assert.match(h.view().textContent,/view shows up to 25/);
 loaded=true;await h.click('data-gw-calendar-read');assert.match(h.view().textContent,/No upcoming appointments/);assert.doesNotMatch(h.view().textContent,/Site meeting/);
});
test('read failures and malformed data clear old appointments without showing provider internals',async()=>{
 let response=reply(result());
 const h=boot(async path=>path.endsWith('/calendar')?response:reply(connection()));await h.open();await h.click('data-gw-calendar-read');assert.match(h.view().textContent,/Site meeting/);
 for(const bad of [
  reply({message:'PRIVATE_PROVIDER_FAILURE',code:'unknown_code'},403),
  reply(result([], {timeZone:'not-a-zone'})),
  reply(result(Array.from({length:26},(_,i)=>event({id:String(i)})))),
  reply(result([event({allDay:true,start:'2026-02-31',end:'2026-03-04'})])),
  reply(result([event({start:'2026-02-31T12:00:00.000Z',end:'2026-03-04T12:00:00.000Z'})])),
  reply(result([event(),event()])),
 ]){
  response=bad;await h.click('data-gw-calendar-read');assert.match(h.view().textContent,/could not be loaded/);assert.doesNotMatch(h.view().textContent,/Site meeting|PRIVATE_PROVIDER_FAILURE/);
 }
 assert.equal(h.readCalls().length,7);
});
test('closing or leaving clears data, aborts pending work and ignores late responses',async()=>{
 for(const action of ['close','native-close','home','other-dialog']){
  const waiting=deferred();const h=boot(async path=>path.endsWith('/calendar')?waiting.promise:reply(connection()));await h.open();await h.click('data-gw-calendar-read');
  const oldHost=h.view(),request=h.readCalls()[0];
  if(action==='close')await h.click('data-ca-close');
  if(action==='native-close')h.dialog().close();
  if(action==='home')await h.navigate('#home');
  if(action==='other-dialog')await h.click('data-ca-app','call-desk');
  assert.equal(request.options.signal.aborted,true);assert.equal(oldHost.textContent,'');
  waiting.resolve(reply(result([event({title:'LATE_PRIVATE_EVENT'})])));await tick();
  assert.ok(!h.view()?.textContent.includes('LATE_PRIVATE_EVENT'));
  await h.navigate('#connections');await h.click('data-ca-app','google-workspace');assert.equal(h.view().textContent,'');assert.match(h.dialog().innerHTML,/View upcoming appointments/);
 }
});
test('logout and account replacement abort or discard all private results',async()=>{
 for(const emitEnd of [true,false]){
  const waiting=deferred();const h=boot(async path=>path.endsWith('/calendar')?waiting.promise:reply(connection()));await h.open();await h.click('data-gw-calendar-read');const oldHost=h.view();
  if(emitEnd)h.end();else h.account.user={id:'member-two'};
  waiting.resolve(reply(result([event({title:'OLD_ACCOUNT_EVENT'})])));await tick();
  assert.equal(oldHost.textContent,'');assert.ok(!h.view()?.textContent.includes('OLD_ACCOUNT_EVENT'));
  if(emitEnd)assert.equal(h.readCalls()[0].options.signal.aborted,true);
 }
});
test('status refresh, reconnect and disconnect review clear private data and fence old revisions',async()=>{
 for(const action of ['revision','reconnect','disconnect']){
  let snapshot=connection();const waiting=deferred();const h=boot(async path=>path.endsWith('/calendar')?waiting.promise:reply(snapshot));
  await h.open();await h.click('data-gw-calendar-read');const oldHost=h.view(),request=h.readCalls()[0];
  if(action==='disconnect')await h.click('data-gw-disconnect-review');
  else {snapshot=connection(action==='revision'?{revision:10}:{state:'reconnect_required'});h.window.dispatchEvent(new Event('focus'));await tick();}
  assert.equal(request.options.signal.aborted,true);assert.equal(oldHost.textContent,'');
  waiting.resolve(reply(result([event({title:'WRONG_REVISION'})])));await tick();
  assert.ok(!h.view()?.textContent.includes('WRONG_REVISION'));
  if(action==='reconnect')assert.doesNotMatch(h.dialog().innerHTML,/data-gw-calendar-read/);
 }
});
test('out-of-order requests after close cannot overwrite a newer Calendar result',async()=>{
 const first=deferred(),second=deferred();let count=0;
 const h=boot(async path=>path.endsWith('/calendar')?(++count===1?first.promise:second.promise):reply(connection()));
 await h.open();await h.click('data-gw-calendar-read');await h.click('data-ca-close');await h.click('data-ca-app','google-workspace');await h.click('data-gw-calendar-read');
 second.resolve(reply(result([event({title:'CURRENT_EVENT'})])));await tick();first.resolve(reply(result([event({title:'STALE_EVENT'})])));await tick();
 assert.match(h.view().textContent,/CURRENT_EVENT/);assert.doesNotMatch(h.view().textContent,/STALE_EVENT/);
});
test('timed-out reads show a safe retry state without automatically fetching again',async()=>{
 const h=boot(async(path,options)=>path.endsWith('/calendar')?new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('PRIVATE_ABORT_DETAIL'),{name:'AbortError'})))):reply(connection()));
 await h.open();await h.click('data-gw-calendar-read');
 const timer=[...h.timers.values()].find(value=>value.ms===85000);assert.ok(timer);timer.fn();await tick();
 assert.match(h.view().textContent,/could not be loaded/);assert.doesNotMatch(h.view().textContent,/PRIVATE_ABORT_DETAIL/);assert.equal(h.readCalls().length,1);
});

test('a displayed calendar clears when a later focus detects a replaced account',async()=>{
 const h=boot();await h.open();await h.click('data-gw-calendar-read');const oldHost=h.view();assert.match(oldHost.textContent,/Site meeting/);
 h.account.user={id:'member-two'};h.window.dispatchEvent(new Event('focus'));await tick();
 assert.equal(oldHost.textContent,'');assert.equal(h.readCalls().length,1);
});
test('hasMore is honored independently of count and never implies an empty seven-day calendar',async()=>{
 const h=boot(async path=>reply(path.endsWith('/calendar')?result([],{hasMore:true}):connection()));await h.open();await h.click('data-gw-calendar-read');
 assert.match(h.view().textContent,/No appointments on this page/);assert.match(h.view().textContent,/More appointments/);assert.doesNotMatch(h.view().textContent,/No upcoming appointments in your primary calendar/);
});

test('a revision conflict offers explicit status recovery without automatically reading events',async()=>{
 let snapshot=connection(),ready=false;
 const h=boot(async path=>path.endsWith('/calendar')?(ready?reply(result()):reply({code:'connection_changed',message:'PRIVATE'},409)):reply(snapshot));
 await h.open();await h.click('data-gw-calendar-read');
 assert.match(h.dialog().innerHTML,/data-gw-refresh>Check Google status/);assert.equal(h.account.locked,false);assert.equal(h.readCalls().length,1);
 snapshot=connection({revision:10});ready=true;await h.click('data-gw-refresh');
 assert.equal(h.readCalls().length,1);assert.match(h.dialog().innerHTML,/View upcoming appointments/);assert.equal(h.view().textContent,'');
 await h.click('data-gw-calendar-read');
 assert.equal(h.readCalls()[1].options.headers['X-Xtreme-Connection-Revision'],'10');assert.match(h.view().textContent,/Site meeting/);
});

test('known Calendar errors use fixed actionable copy while all raw messages stay private',async()=>{
 const cases=[
  ['calendar_api_disabled',503,/administrator to enable it/],
  ['calendar_scope_required',403,/Update Google access and approve Calendar/],
  ['calendar_reconnect_required',409,/Check Google status, then reconnect/],
  ['reconnect_required',503,/Check Google status, then reconnect/],
  ['calendar_rate_limited',429,/Wait a moment/],
  ['connection_changed',409,/connection changed/],
  ['calendar_disabled',503,/not enabled for this app yet/],
  ['calendar_timeout',504,/took too long/]
 ];
 for(const [code,http,expected] of cases){
  const h=boot(async path=>path.endsWith('/calendar')?reply({code,message:'PRIVATE_GOOGLE_PROVIDER_DETAIL'},http):reply(connection()));
  await h.open();await h.click('data-gw-calendar-read');
  assert.match(h.view().textContent,expected);assert.doesNotMatch(h.view().textContent,/PRIVATE_GOOGLE_PROVIDER_DETAIL/);assert.equal(h.account.locked,false);
  assert.match(h.dialog().innerHTML,/data-gw-refresh/);assert.equal(h.readCalls().length,1);
 }
});
test('frontend enforces the final bounded event field contract',async()=>{
 for(const bad of [event({id:'x'.repeat(257)}),event({title:'x'.repeat(201)}),event({location:'x'.repeat(301)})]){
  const h=boot(async path=>reply(path.endsWith('/calendar')?result([bad]):connection()));await h.open();await h.click('data-gw-calendar-read');assert.match(h.view().textContent,/could not be loaded/);
 }
});

test('the actual Python adapter fixture renders through the client with canonical dates and UTF-16 caps',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/google-calendar-runtime.json',import.meta.url),'utf8'));
 assert.equal(fixture.events[1].title.length,200);assert.equal(fixture.events[1].location.length,300);
 const h=boot(async path=>reply(path.endsWith('/calendar')?fixture:connection()));
 await h.open();await h.click('data-gw-calendar-read');
 const text=h.view().textContent,list=h.view().children.find(node=>node.tag==='ul');
 assert.equal(list.children.length,2);assert.match(text,/All-day inspection/);assert.match(text,/All day · Nov 7, 2026/);
 assert.doesNotMatch(text,/Nov 8, 2026|could not be loaded/);assert.match(text,/8:00 AM/);assert.match(text,/9:00 AM/);
 assert.ok(text.includes(fixture.events[1].title));assert.ok(text.includes(fixture.events[1].location));
 assert.match(text,/America\/New_York/);assert.match(text,/More appointments/);
});

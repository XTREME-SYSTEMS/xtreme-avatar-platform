import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/google-workspace.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const approval='https://accounts.google.com/o/oauth2/v2/auth?client_id=test&response_type=code&state=diagnostic';
const status=(state='disconnected',services=[])=>({state,configured:state!=='setup_required',account:['connected','reconnect_required'].includes(state)?{email:'chosen-google@example.com',displayName:'Chosen Google'}:null,revision:['connected','reconnect_required'].includes(state)?7:null,services});

function boot(handler=async()=>reply(status()),{topNavigation=true,search='',hash='#home'}={}){
 const documentHandlers=new Map(),windowHandlers=new Map(),nodes=new Map(),calls=[],events=[],navigations=[],timers=new Map();let timerId=0;
 const account={user:{id:'user-one'},locked:false,invalidate(){this.locked=true;this.user=null;window.dispatchEvent(new Event('xtreme:account-ended'));}};
 function element(tag='div'){
  const listeners=new Map();
  return {tag,id:'',className:'',innerHTML:'',open:false,isConnected:true,focus(){},setAttribute(){},addEventListener(type,fn){listeners.set(type,fn);},querySelector(){return {focus(){}};},showModal(){this.open=true;},close(){this.open=false;listeners.get('close')?.();},remove(){this.isConnected=false;nodes.delete('#'+this.id);},replaceChildren(){this.innerHTML='';}};
 }
 for(const selector of ['#connected-app-list','.connected-apps'])nodes.set(selector,element());
 const window={XtremeAccount:account,addEventListener(type,fn){windowHandlers.set(type,[...(windowHandlers.get(type)||[]),fn]);},dispatchEvent(event){events.push(event);for(const fn of windowHandlers.get(event.type)||[])fn(event);},top:{location:{assign(url){if(!topNavigation)throw Error('Top navigation blocked');navigations.push(url);}}}};
 const document={visibilityState:'visible',body:{append(el){nodes.set('#'+el.id,el);}},addEventListener(type,fn){documentHandlers.set(type,[...(documentHandlers.get(type)||[]),fn]);},querySelector:selector=>nodes.get(selector)||null,createElement:element};
 const location={hash,search,href:'https://app.example/'+search+hash};
 const fetch=async(path,options)=>{calls.push({path,options});return path.startsWith('/api/call-desk-link/')?reply({status:'unlinked',linked:false}):handler(path,options);};
 vm.runInNewContext(source,{window,document,location,Event,URL,URLSearchParams,fetch,AbortController,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
 const control=(attr,value='',extra={})=>({dataset:{[attr.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value},isConnected:true,focus(){},...extra,closest(selector){return selector===`[${attr}]`?this:null;}});
 async function dispatch(type,target){for(const fn of documentHandlers.get(type)||[])fn({type,target,preventDefault(){}});await tick();}
 async function click(attr,value='',extra){await dispatch('click',control(attr,value,extra));}
 async function navigate(hash){location.hash=hash;window.dispatchEvent(new Event('hashchange'));await tick();}
 const render=()=>window.XtremeGoogleWorkspace.render();
 return {window,document,account,location,calls,events,navigations,nodes,timers,control,dispatch,click,navigate,render,dialog:()=>nodes.get('#connected-app-dialog'),end:()=>account.invalidate()};
}


const choose=async(h,id,checked=true)=>h.dispatch('change',h.control('data-gw-service',id,{checked}));
const googleCalls=h=>h.calls.filter(call=>call.path.startsWith('/api/connections/google/'));
test('existing connection screen offers one Workspace entry and leaves home idle',()=>{
 const h=boot(),html=h.render();
 assert.match(html,/data-ca-app="google-workspace"/);assert.match(html,/Gmail/);assert.match(html,/Sheets/);
 assert.equal(h.calls.length,0);assert.equal(h.navigations.length,0);
 assert.doesNotMatch(html,/api.?key|type="password"/i);
});
test('setup-required has all eight read-only choices and no inoperable consent button',async()=>{
 const h=boot(async()=>reply(status('setup_required')));h.account.user.role='owner';
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');
 const html=h.dialog().innerHTML;
 for(const id of ['gmail','calendar','drive','docs','sheets','slides','contacts','tasks'])assert.ok(html.includes('data-gw-service="'+id+'"'));
 assert.match(html,/one-time setup/);assert.match(html,/After successful approval, this app keeps only selected access/);assert.match(html,/Unchecking does not revoke Google/);assert.match(html,/Google sign-in is separate/);assert.match(html,/does not create, join or record meetings/);
 assert.doesNotMatch(html,/data-gw-start|is-connected/);
 await choose(h,'gmail');await h.click('data-gw-start');assert.equal(googleCalls(h).filter(c=>c.options.method==='POST').length,0);
});
test('selected services use one consent flow, fixed account headers and no auth-account change',async()=>{
 const waiting=deferred();const h=boot(async path=>path.endsWith('/start')?waiting.promise:reply(status()));
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');
 await h.click('data-gw-start');assert.equal(googleCalls(h).filter(c=>c.options.method==='POST').length,0);
 await choose(h,'gmail');await choose(h,'calendar');await choose(h,'invalid');
 await h.click('data-gw-start');await h.click('data-gw-start');
 const calls=googleCalls(h),post=calls.find(c=>c.path.endsWith('/start'));
 assert.deepEqual(JSON.parse(post.options.body),{services:['gmail','calendar']});
 assert.ok(calls.every(c=>c.options.headers['X-Xtreme-Account']==='user-one'&&c.options.credentials==='same-origin'&&c.options.cache==='no-store'));
 assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 waiting.resolve(reply({authorizationUrl:approval}));await tick();
 assert.deepEqual(h.navigations,[approval]);assert.equal(h.account.user.id,'user-one');assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);
});
test('partial permission grants stay distinct from enabled assistant actions',async()=>{
 const granted=[{id:'gmail',authorized:true,enabled:false},{id:'calendar',authorized:false,enabled:false}];
 const h=boot(async()=>reply(status('connected',granted)));await h.navigate('#connections');await h.click('data-ca-app','google-workspace');
 const html=h.dialog().innerHTML;
 assert.match(html,/chosen-google@example.com/);assert.match(html,/Read access approved/);assert.match(html,/Needs permission/);
 assert.match(html,/data-gw-service="gmail"[^>]* checked/);assert.doesNotMatch(html,/data-gw-service="calendar"[^>]* checked/);
 assert.match(html,/Only the available actions shown here are enabled/);assert.match(html,/Email sending and file changes are not enabled; Calendar changes require separate editing approval and a reviewed save/);assert.equal(h.account.user.id,'user-one');
});
test('callback flags and raw provider errors cannot fabricate a verified connection',async()=>{
 const waiting=deferred();const h=boot(()=>waiting.promise,{search:'?google=connected&error_description=PRIVATE_PROVIDER_TEXT'});
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');
 assert.doesNotMatch(h.dialog().innerHTML,/is-connected|PRIVATE_PROVIDER_TEXT/);
 waiting.resolve(reply({error:'PRIVATE_PROVIDER_TEXT'},503));await tick();
 assert.doesNotMatch(h.dialog().innerHTML,/is-connected|PRIVATE_PROVIDER_TEXT/);
 assert.match(h.dialog().innerHTML,/could not be confirmed/);
});
test('unsafe Google authorization destinations are blocked and starts do not auto-retry',async()=>{
 for(const authorizationUrl of ['javascript:alert(1)','https://evil.example/o/oauth2/v2/auth','https://accounts.google.com.evil.example/o/oauth2/v2/auth','https://accounts.google.com/other','https://user@accounts.google.com/o/oauth2/v2/auth','https://accounts.google.com/o/oauth2/v2/auth#token=x']){
  const h=boot(async path=>path.endsWith('/start')?reply({authorizationUrl}):reply(status()));await h.navigate('#connections');await h.click('data-ca-app','google-workspace');await choose(h,'gmail');await h.click('data-gw-start');await h.click('data-gw-start');
  assert.equal(h.navigations.length,0);assert.equal(googleCalls(h).filter(c=>c.path.endsWith('/start')).length,1);assert.match(h.dialog().innerHTML,/address could not be verified/);
  await h.click('data-gw-refresh');assert.match(h.dialog().innerHTML,/data-gw-start/);
 }
});
test('failed or malformed status clears claims and hides raw transport errors',async()=>{
 for(const bad of [{...status('connected'),revision:null},{...status('connected'),configured:false},{...status('connected'),services:[{id:'gmail',authorized:false,enabled:true}]},{...status('connected'),services:[{id:'unknown',authorized:true,enabled:true}]}]){
  const h=boot(async()=>reply(bad));await h.navigate('#connections');await h.click('data-ca-app','google-workspace');assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);
 }
 const h=boot(async()=>({ok:true,status:200,json:async()=>{throw Error('PRIVATE_PROVIDER_TEXT');}}));await h.navigate('#connections');await h.click('data-ca-app','google-workspace');
 assert.doesNotMatch(h.dialog().innerHTML,/PRIVATE_PROVIDER_TEXT/);assert.match(h.dialog().innerHTML,/could not be confirmed/);
});
test('local disconnect requires review and uses observed revision, then rechecks status',async()=>{
 let disconnected=false;const h=boot(async(path)=>{if(path.endsWith('/disconnect')){disconnected=true;return reply({ok:true,providerRevoked:false});}return reply(disconnected?status():status('connected',[{id:'gmail',authorized:true,enabled:false}]));});
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');await h.click('data-gw-disconnect-confirm');
 assert.equal(googleCalls(h).filter(c=>c.options.method==='POST').length,0);
 await h.click('data-gw-disconnect-review');assert.match(h.dialog().innerHTML,/all Google services in this app/);assert.match(h.dialog().innerHTML,/does not delete Google data or revoke permissions used by other apps/);
 await h.click('data-gw-disconnect-confirm');await tick();
 const post=googleCalls(h).find(c=>c.path.endsWith('/disconnect'));assert.deepEqual(JSON.parse(post.options.body),{confirm:true,revision:7});
 assert.match(h.dialog().innerHTML,/Not connected/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected|chosen-google@example.com/);
});
test('stale disconnect does not claim success or repeat destructive requests',async()=>{
 const h=boot(async path=>path.endsWith('/disconnect')?reply({code:'stale_revision'},409):reply(status('connected')));
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');await h.click('data-gw-disconnect-review');await h.click('data-gw-disconnect-confirm');await h.click('data-gw-disconnect-confirm');
 assert.match(h.dialog().innerHTML,/connection changed/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);
 assert.equal(googleCalls(h).filter(c=>c.path.endsWith('/disconnect')).length,1);
});
test('logout aborts all Google requests and ignores late OAuth responses',async()=>{
 const waiting=deferred();const h=boot(async path=>path.endsWith('/start')?waiting.promise:reply(status()));
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');await choose(h,'gmail');await h.click('data-gw-start');
 const req=googleCalls(h).at(-1);h.end();assert.equal(req.options.signal.aborted,true);assert.equal(h.dialog(),undefined);assert.equal(h.render(),'');
 waiting.resolve(reply({authorizationUrl:approval}));await tick();assert.equal(h.navigations.length,0);assert.equal(h.render(),'');
});
test('account switch and server account_changed suppress old account results',async()=>{
 const waiting=deferred();const h=boot(()=>waiting.promise);await h.navigate('#connections');h.account.user={id:'user-two'};
 waiting.resolve(reply(status('connected')));await tick();assert.equal(h.render(),'');assert.equal(h.navigations.length,0);
 const other=boot(async()=>reply({code:'account_changed'},409));await other.navigate('#connections');assert.equal(other.account.locked,true);assert.equal(other.render(),'');
});
test('closing or leaving while approval starts cannot hijack later navigation',async()=>{
 const waiting=deferred();const h=boot(async path=>path.endsWith('/start')?waiting.promise:reply(status()));
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');await choose(h,'gmail');await h.click('data-gw-start');await h.navigate('#home');
 waiting.resolve(reply({authorizationUrl:approval}));await tick();assert.equal(h.navigations.length,0);assert.equal(h.dialog().open,false);
});
test('blocked frame navigation presents only the validated top-level Google link',async()=>{
 const h=boot(async path=>path.endsWith('/start')?reply({authorizationUrl:approval}):reply(status()),{topNavigation:false});
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');await choose(h,'gmail');await h.click('data-gw-start');
 assert.equal(h.navigations.length,0);assert.ok(h.dialog().innerHTML.includes('href="'+approval.replaceAll('&','&amp;')+'" target="_top"'));assert.match(h.dialog().innerHTML,/Continue to Google/);
});
test('focus refresh detects revoked grants and reconnect controls require a fresh check',async()=>{
 let state='connected';const h=boot(async()=>reply(status(state,[{id:'gmail',authorized:true,enabled:false}])));await h.navigate('#connections');await h.click('data-ca-app','google-workspace');assert.match(h.dialog().innerHTML,/is-connected/);
 state='reconnect_required';h.window.dispatchEvent(new Event('focus'));await tick();assert.match(h.dialog().innerHTML,/Reconnect required/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);assert.match(h.dialog().innerHTML,/Reconnect with Google/);
 assert.ok(googleCalls(h).every(c=>c.options.method==='GET'));
});

test('slow Workspace checks allow the upstream budget, time out safely and never auto-retry',async()=>{
 const h=boot(async(path,options)=>{
   if(!path.endsWith('/start'))return reply(status());
   return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('PRIVATE_TIMEOUT_DETAIL'),{name:'AbortError'}))));
 });
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');await choose(h,'gmail');await h.click('data-gw-start');
 const timer=[...h.timers.values()].find(item=>item.ms>70000);
 assert.ok(timer,'Workspace request must outlast the backend status budget');
 assert.ok(timer.ms<=90000,'Workspace request must still have a finite timeout');
 timer.fn();await tick();
 assert.match(h.dialog().innerHTML,/timed out/);assert.doesNotMatch(h.dialog().innerHTML,/PRIVATE_TIMEOUT_DETAIL/);
 await h.click('data-gw-start');await tick();
 assert.equal(googleCalls(h).filter(call=>call.path.endsWith('/start')).length,1);
 assert.equal(h.navigations.length,0);
});

test('direct OAuth callback load refreshes actual server status before claiming connected',async()=>{
 const waiting=deferred();
 const h=boot(()=>waiting.promise,{search:'?google=connected',hash:'#connections'});
 assert.equal(googleCalls(h).filter(call=>call.path.endsWith('/status')).length,1);
 assert.doesNotMatch(h.render(),/is-connected/);
 waiting.resolve(reply(status('connected',[{id:'calendar',authorized:true,enabled:false}])));await tick();
 await h.click('data-ca-app','google-workspace');
 assert.match(h.dialog().innerHTML,/chosen-google@example.com/);
 assert.match(h.dialog().innerHTML,/Read access approved/);
 assert.equal(googleCalls(h).filter(call=>call.options.method==='POST').length,0);
});

test('exact new-account runtime states accept revision zero and eight ungranted services',async()=>{
 for(const state of ['setup_required','disconnected']){
  const h=boot(async()=>reply({state,configured:state==='disconnected',account:null,revision:0,hasSavedConnection:false,services:['gmail','calendar','drive','docs','sheets','slides','contacts','tasks'].map(id=>({id,authorized:false,enabled:false}))}));
  await h.navigate('#connections');await h.click('data-ca-app','google-workspace');
  assert.doesNotMatch(h.dialog().innerHTML,/could not be verified|data-gw-disconnect-review/);
  if(state==='setup_required')assert.match(h.dialog().innerHTML,/one-time setup/);
  else{await choose(h,'gmail');assert.match(h.dialog().innerHTML,/data-gw-start/);}
 }
 const invalid=boot(async()=>reply({...status('connected'),revision:0,hasSavedConnection:true}));
 await invalid.navigate('#connections');await invalid.click('data-ca-app','google-workspace');
 assert.doesNotMatch(invalid.dialog().innerHTML,/is-connected|data-gw-disconnect-review/);
});
test('inaccessible saved grants can be locally disconnected without available Google config or account display',async()=>{
 let removed=false;
 const h=boot(async path=>{
  if(path.endsWith('/disconnect')){removed=true;return reply({ok:true,providerRevoked:false});}
  return reply({state:'setup_required',configured:false,account:null,revision:removed?10:9,hasSavedConnection:!removed,services:[]});
 });
 await h.navigate('#connections');await h.click('data-ca-app','google-workspace');
 assert.match(h.dialog().innerHTML,/saved Google connection is unavailable/);
 assert.match(h.dialog().innerHTML,/data-gw-disconnect-review/);assert.doesNotMatch(h.dialog().innerHTML,/data-gw-start/);
 await h.click('data-gw-disconnect-review');await h.click('data-gw-disconnect-confirm');await tick();
 const call=googleCalls(h).find(item=>item.path.endsWith('/disconnect'));
 assert.deepEqual(JSON.parse(call.options.body),{confirm:true,revision:9});
 assert.doesNotMatch(h.dialog().innerHTML,/data-gw-disconnect-review|saved Google connection is unavailable/);
});
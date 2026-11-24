import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/google-workspace.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const approval='https://eden-skye-call-desk.strategic-ai.chatgpt.site/connect/xtreme#ticket=verified-ticket.signature';

function boot(handler=async()=>reply({status:'unlinked',linked:false}),{topNavigation=true}={}){
 const documentHandlers=new Map(),windowHandlers=new Map(),nodes=new Map(),calls=[],events=[],navigations=[],timers=new Map();let timerId=0;
 const account={user:{id:'user-one'},locked:false,invalidate(){this.locked=true;this.user=null;window.dispatchEvent(new Event('xtreme:account-ended'));}};
 function element(tag='div'){
  const listeners=new Map();
  return {tag,id:'',className:'',innerHTML:'',open:false,isConnected:true,focus(){},setAttribute(){},addEventListener(type,fn){listeners.set(type,fn);},querySelector(){return {focus(){}};},showModal(){this.open=true;},close(){this.open=false;listeners.get('close')?.();},remove(){this.isConnected=false;nodes.delete('#'+this.id);},replaceChildren(){this.innerHTML='';}};
 }
 for(const selector of ['#connected-app-list','.connected-apps'])nodes.set(selector,element());
 const window={XtremeAccount:account,addEventListener(type,fn){windowHandlers.set(type,[...(windowHandlers.get(type)||[]),fn]);},dispatchEvent(event){events.push(event);for(const fn of windowHandlers.get(event.type)||[])fn(event);},top:{location:{assign(url){if(!topNavigation)throw Error('Top navigation blocked');navigations.push(url);}}}};
 const document={visibilityState:'visible',body:{append(el){nodes.set('#'+el.id,el);}},addEventListener(type,fn){documentHandlers.set(type,[...(documentHandlers.get(type)||[]),fn]);},querySelector:selector=>nodes.get(selector)||null,createElement:element};
 const location={hash:'#home'};
 const fetch=async(path,options)=>{calls.push({path,options});return path.startsWith('/api/connections/google/')?reply({state:'setup_required',configured:false,account:null,revision:null,services:[]}):handler(path,options);};
 vm.runInNewContext(source,{window,document,location,Event,URL,URLSearchParams,fetch,AbortController,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
 const control=(attr,value='',extra={})=>({dataset:{[attr.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value},isConnected:true,focus(){},...extra,closest(selector){return selector===`[${attr}]`?this:null;}});
 async function dispatch(type,target){for(const fn of documentHandlers.get(type)||[])fn({type,target,preventDefault(){}});await tick();}
 async function click(attr,value='',extra){await dispatch('click',control(attr,value,extra));}
 async function navigate(hash){location.hash=hash;window.dispatchEvent(new Event('hashchange'));await tick();}
 const render=()=>window.XtremeGoogleWorkspace.render();
 return {window,document,account,location,calls,events,navigations,nodes,timers,control,dispatch,click,navigate,render,dialog:()=>nodes.get('#connected-app-dialog'),end:()=>account.invalidate()};
}

test('hub renders real tools and setup-required Google apps without collecting keys or auto-linking',()=>{
 const h=boot(),html=h.render();
 for(const name of ['Call Desk','Gmail','Google Calendar','Google Drive','Google Contacts','GPT live voice','Tavus video','Twilio calling','XPS Auto Leads','XPS Infinity Loop'])assert.ok(html.includes(name));
 assert.match(html,/0<\/strong> verified account links/);assert.match(html,/Choose Google Workspace/);
 assert.match(html,/data-ca-category="google"/);assert.match(html,/id="connected-app-search"/);
 assert.equal(h.calls.length,0);assert.equal(h.navigations.length,0);assert.doesNotMatch(html,/type="password"|api.?key/i);
});

test('Google Workspace details expose honest setup and no inoperable authorization controls',async()=>{
 const h=boot();await h.navigate('#connections');
 for(const [id,url] of [['gmail','https://mail.google.com/'],['calendar','https://calendar.google.com/'],['drive','https://drive.google.com/'],['contacts','https://contacts.google.com/']]){
  await h.click('data-ca-app',id);const html=h.dialog().innerHTML;
  assert.match(html,/Google Workspace needs one-time setup/);assert.match(html,/No Google data is read by this screen/);
  assert.match(html,/Google Workspace/);assert.doesNotMatch(html,/data-gw-start/);
  assert.doesNotMatch(html,/data-ca-connect|data-ca-disconnect|type="password"/);
  if(id==='drive')for(const product of ['Docs','Sheets','Slides'])assert.ok(html.includes(product));
  if(id==='calendar')assert.match(html,/Meet links/);
  await h.click('data-ca-close');
 }
 assert.ok(h.calls.every(call=>['/api/call-desk-link/status','/api/connections/google/status'].includes(call.path)));assert.equal(h.navigations.length,0);
});

test('search and categories filter names and specialties without injecting HTML',async()=>{
 const h=boot();await h.navigate('#connections');await h.click('data-ca-category','google');
 assert.match(h.render(),/data-ca-app="gmail"/);assert.doesNotMatch(h.render(),/data-ca-app="call-desk"/);
 await h.dispatch('input',{id:'connected-app-search',value:'Sheets'});
 assert.match(h.nodes.get('#connected-app-list').innerHTML,/data-ca-app="drive"/);assert.doesNotMatch(h.nodes.get('#connected-app-list').innerHTML,/data-ca-app="gmail"/);
 await h.dispatch('input',{id:'connected-app-search',value:'"><img src=x onerror=1>'});
 assert.match(h.render(),/&quot;&gt;&lt;img src=x onerror=1&gt;/);assert.doesNotMatch(h.render(),/<img src=x/);
});

test('only a verified fresh server status shows Connected and a failed refresh removes that claim',async()=>{
 let checks=0;const h=boot(async()=>++checks===1?reply({status:'linked',linked:true,revision:4,displayName:'<img src=x onerror=1>'}):reply({error:'Unavailable'},503));
 await h.navigate('#connections');assert.match(h.render(),/1<\/strong> verified account link/);await h.click('data-ca-app','call-desk');
 assert.match(h.dialog().innerHTML,/Connected/);assert.match(h.dialog().innerHTML,/&lt;img src=x onerror=1&gt;/);assert.doesNotMatch(h.dialog().innerHTML,/<img src=x/);
 await h.click('data-ca-refresh');assert.match(h.render(),/0<\/strong> verified account links/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);
});

test('connect starts one same-origin request and navigates to the exact server-owned consent page',async()=>{
 const waiting=deferred();const h=boot(async path=>path.endsWith('/start')?waiting.promise:reply({status:'unlinked',linked:false}));
 await h.navigate('#connections');await h.click('data-ca-app','call-desk');
 await h.click('data-ca-connect');await h.click('data-ca-connect');
 assert.equal(h.calls.filter(call=>call.path.endsWith('/start')).length,1);
 const call=h.calls.find(call=>call.path.endsWith('/start'));
 assert.equal(call.options.method,'POST');assert.equal(call.options.headers['X-Xtreme-Account'],'user-one');assert.equal(call.options.credentials,'same-origin');assert.deepEqual(JSON.parse(call.options.body),{});
 assert.equal(h.navigations.length,0);waiting.resolve(reply({connectUrl:approval,expiresAt:'2026-11-07T03:00:00Z'}));await tick();
 assert.deepEqual(h.navigations,[approval]);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);assert.match(h.dialog().innerHTML,/Awaiting approval/);
});

test('unsafe consent URLs never navigate and ambiguous starts require a status refresh before retry',async()=>{
 for(const url of ['https://evil.test/connect/xtreme#ticket=abc','javascript:alert(1)','https://eden-skye-call-desk.strategic-ai.chatgpt.site/other#ticket=abc','https://eden-skye-call-desk.strategic-ai.chatgpt.site/connect/xtreme?redirect=https://evil.test#ticket=abc']){
  const h=boot(async path=>path.endsWith('/start')?reply({connectUrl:url}):reply({status:'unlinked',linked:false}));
  await h.navigate('#connections');await h.click('data-ca-app','call-desk');await h.click('data-ca-connect');await h.click('data-ca-connect');
  assert.equal(h.navigations.length,0);assert.equal(h.calls.filter(call=>call.path.endsWith('/start')).length,1);assert.match(h.dialog().innerHTML,/approval address could not be verified/);
  await h.click('data-ca-refresh');assert.match(h.dialog().innerHTML,/data-ca-connect/);
 }
});

test('pending approvals can resume, revoked links can reconnect, and blocked frame navigation has a safe top-level link',async()=>{
 for(const status of ['pending','revoked']){
  const h=boot(async path=>path.endsWith('/start')?reply({connectUrl:approval}):reply({status,linked:false}),{topNavigation:false});
  await h.navigate('#connections');await h.click('data-ca-app','call-desk');assert.match(h.dialog().innerHTML,/data-ca-connect/);
  if(status==='pending')assert.match(h.dialog().innerHTML,/Continue approval/);
  await h.click('data-ca-connect');assert.equal(h.navigations.length,0);assert.ok(h.dialog().innerHTML.includes(`href="${approval}" target="_top"`));
 }
});

test('disconnect requires explicit review then confirmation and sends the exact observed revision',async()=>{
 let disconnected=false;const h=boot(async(path,options)=>{if(path.endsWith('/disconnect')){disconnected=true;return reply({ok:true});}return reply(disconnected?{status:'revoked',linked:false}:{status:'linked',linked:true,revision:7,displayName:'My account'});});
 await h.navigate('#connections');await h.click('data-ca-app','call-desk');await h.click('data-ca-disconnect-confirm');
 assert.equal(h.calls.filter(call=>call.options.method==='POST').length,0);
 await h.click('data-ca-disconnect-review');assert.match(h.dialog().innerHTML,/Disconnect this account link/);assert.equal(h.calls.filter(call=>call.options.method==='POST').length,0);
 await h.click('data-ca-disconnect-confirm');await tick();
 const post=h.calls.find(call=>call.path.endsWith('/disconnect'));assert.deepEqual(JSON.parse(post.options.body),{confirm:true,revision:7});
 assert.match(h.dialog().innerHTML,/Not connected/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);
});

test('stale revoke and malformed status never imply disconnection or fabricate a connected badge',async()=>{
 const h=boot(async path=>path.endsWith('/disconnect')?reply({code:'stale_revision'},409):reply({status:'linked',linked:true,revision:2}));
 await h.navigate('#connections');await h.click('data-ca-app','call-desk');await h.click('data-ca-disconnect-review');await h.click('data-ca-disconnect-confirm');
 assert.match(h.dialog().innerHTML,/connection changed/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);assert.match(h.dialog().innerHTML,/Check connection/);
 const bad=boot(async()=>reply({status:'linked',linked:true}));await bad.navigate('#connections');assert.match(bad.render(),/0<\/strong> verified account links/);
});

test('closing or leaving the hub while start is pending cannot hijack later navigation',async()=>{
 let started=false;const waiting=deferred();const h=boot(async path=>{if(path.endsWith('/start')){started=true;return waiting.promise;}return reply({status:started?'pending':'unlinked',linked:false});});
 await h.navigate('#connections');await h.click('data-ca-app','call-desk');await h.click('data-ca-connect');await h.navigate('#home');
 waiting.resolve(reply({connectUrl:approval}));await tick();assert.equal(h.navigations.length,0);assert.equal(h.dialog().open,false);
 await h.navigate('#connections');await h.click('data-ca-app','call-desk');assert.match(h.dialog().innerHTML,/Continue approval/);
});

test('account end aborts requests, clears the dialog and ignores late link responses',async()=>{
 const waiting=deferred();const h=boot(async path=>path.endsWith('/start')?waiting.promise:reply({status:'unlinked',linked:false}));
 await h.navigate('#connections');await h.click('data-ca-app','call-desk');await h.click('data-ca-connect');
 const call=h.calls.at(-1);h.end();assert.equal(call.options.signal.aborted,true);assert.equal(h.dialog(),undefined);assert.equal(h.render(),'');
 waiting.resolve(reply({connectUrl:approval}));await tick();assert.equal(h.navigations.length,0);assert.equal(h.render(),'');
});

test('another cookie account cannot render results or authorize a late link',async()=>{
 const waiting=deferred();const h=boot(async path=>path.endsWith('/start')?waiting.promise:reply({status:'unlinked',linked:false}));
 await h.navigate('#connections');await h.click('data-ca-app','call-desk');await h.click('data-ca-connect');h.account.user={id:'user-two'};
 waiting.resolve(reply({connectUrl:approval}));await tick();assert.equal(h.navigations.length,0);assert.equal(h.render(),'');
});


test('revisiting or refocusing the hub rechecks links revoked in another tab',async()=>{
 let linked=true;const h=boot(async()=>reply(linked?{status:'linked',linked:true,revision:3}:{status:'revoked',linked:false}));
 await h.navigate('#connections');assert.match(h.render(),/1<\/strong> verified account link/);
 await h.navigate('#home');linked=false;await h.navigate('#connections');assert.match(h.render(),/0<\/strong> verified account links/);
 linked=true;h.window.dispatchEvent(new Event('focus'));await tick();assert.match(h.render(),/1<\/strong> verified account link/);
 linked=false;await h.dispatch('visibilitychange',{});assert.match(h.render(),/0<\/strong> verified account links/);
 assert.ok(h.calls.every(call=>call.options.method==='GET'));
});

test('provider tools never masquerade as personal account links and memory controls stay on Call Desk',async()=>{
 const h=boot(async()=>reply({status:'linked',linked:true,revision:2}));await h.navigate('#connections');
 await h.click('data-ca-app','twilio');assert.match(h.dialog().innerHTML,/Personal line setup required/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);
 h.account.user.role='owner';await h.click('data-ca-app','twilio');assert.match(h.dialog().innerHTML,/Owner line/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);
 for(const id of ['gpt-voice','tavus']){await h.click('data-ca-app',id);assert.match(h.dialog().innerHTML,/Available in app/);assert.doesNotMatch(h.dialog().innerHTML,/is-connected/);}
 await h.click('data-ca-app','call-desk');assert.ok(h.dialog().innerHTML.includes('href="https://eden-skye-call-desk.strategic-ai.chatgpt.site/account"'));
 assert.match(h.dialog().innerHTML,/not Tavus video or phone calls/);assert.match(h.dialog().innerHTML,/not automatically saved as memories/);
});
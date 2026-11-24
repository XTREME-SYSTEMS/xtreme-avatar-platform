import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const source=readFileSync(new URL('../public/assistant-chat.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const reply=(data,status=200)=>({ok:status<400,status,json:async()=>data});
const completed=(requestId,message,answer='Here is your answer.')=>({ok:true,requestId,reply:answer,messages:[{id:requestId+'-user',role:'user',content:message},{id:requestId+'-assistant',role:'assistant',content:answer}]});

async function harness({ready=true,history={messages:[],pending:false,pendingRequest:null},handler,initialDraft='Help with this bid.'}={}){
 const handlers=new Map(),windowHandlers=new Map(),calls=[],htmlWrites=[],sent=[],timers=new Map();let timerId=0,draftText=initialDraft,roots=[];
 class Node{
  constructor(tag='div',attrs={}){this.tag=tag;this.attrs={...attrs};this.children=[];this.id=attrs.id||'';this.className=attrs.class||'';this.text='';this.disabled=false;this.html='';}
  matches(selector){if(selector[0]==='#')return this.id===selector.slice(1);if(selector[0]==='.')return this.className.split(' ').includes(selector.slice(1));const attr=selector.match(/^\[([^\]]+)\]$/);return attr?Object.hasOwn(this.attrs,attr[1]):this.tag===selector;}
  closest(selector){return this.matches(selector)?this:null;}
  setAttribute(key,value){this.attrs[key]=value;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.text='';this.html='';}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join(' ');}
  set textContent(value){this.text=String(value);this.children=[];}
  get innerHTML(){return this.html;}
  set innerHTML(value){htmlWrites.push(value);this.html=value;this.children=[];this.text='';if(value==='STATIC EMPTY CHAT')this.append(new Node('p',{class:'assistant-chat-empty-note'}));}
 }
 const all=()=>{const walk=node=>[node,...node.children.flatMap(walk)];return roots.flatMap(walk);};
 const find=selector=>all().find(node=>node.matches(selector))||null;
 const document={querySelector:find,createElement:tag=>new Node(tag),createTextNode(text){const node=new Node('#text');node.textContent=text;return node;},addEventListener(type,fn){handlers.set(type,[...(handlers.get(type)||[]),fn]);}};
 const window={addEventListener(type,fn){windowHandlers.set(type,[...(windowHandlers.get(type)||[]),fn]);},dispatchEvent(event){for(const fn of windowHandlers.get(event.type)||[])fn(event);return true;}};
 const account={locked:false,user:{id:'member-a'},invalidate(){this.locked=true;this.user=null;window.dispatchEvent(new Event('xtreme:account-ended'));roots=[];draftText='';}};
 window.XtremeAccount=account;
 window.XtremeChatDraft={ownerId:'member-a',get value(){return draftText;},sent(message){sent.push(message);if(draftText===message)draftText='';}};
 const mount=()=>{const form=new Node('form',{id:'assistant-chat-form'}),body=new Node('div',{class:'assistant-chat-body'});body.innerHTML='STATIC EMPTY CHAT';form.append(new Node('button',{class:'assistant-chat-send'}));roots=[form,body,new Node('p',{id:'assistant-chat-connection'}),new Node('textarea',{id:'assistant-chat-input'})];window.XtremeAssistantChat?.render();};
 mount();
 const context=vm.createContext({window,document,AbortController,Event,crypto:webcrypto,WeakMap,
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  fetch:async(path,options)=>{const call={path,options,body:options.body?JSON.parse(options.body):null};calls.push(call);const result=await handler?.(call);return result??reply(path.endsWith('/status')?{chat:{ready,reason:'Connection pending'},voice:{ready:false}}:history);}
 });
 vm.runInContext(source,context);await tick();
 async function change(text){draftText=text;for(const fn of handlers.get('input')||[])fn({target:find('#assistant-chat-input')});await tick();}
 async function retry(){const button=find('[data-assistant-chat-retry]');assert.ok(button);for(const fn of handlers.get('click')||[])fn({target:button,preventDefault(){}});await tick();}
 return {window,account,calls,htmlWrites,sent,find,change,retry,mount,makeNode:tag=>new Node(tag),unmount(){roots=[];},submit:()=>window.XtremeAssistantChat.submit(),get draft(){return draftText;},runAgain:()=>vm.runInContext(source,context),async expire(ms){for(const [id,timer]of[...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}await tick();}};
}

test('chat enables sending only after readiness and private history load; no request is sent on boot',async()=>{
 const h=await harness();
 assert.equal(h.find('.assistant-chat-send').disabled,false);
 assert.match(h.find('#assistant-chat-connection').textContent,/Connected/);
 assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>c.options.method==='GET'));
 for(const {options}of h.calls){assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(options.headers['X-Xtreme-Account'],'member-a');}
 h.runAgain();assert.equal(h.calls.length,2);
 await h.change('   ');assert.equal(h.find('.assistant-chat-send').disabled,true);
 const unavailable=await harness({ready:false});await unavailable.submit();
 assert.equal(unavailable.calls.length,2);assert.equal(unavailable.draft,'Help with this bid.');
 assert.match(unavailable.find('#assistant-chat-runtime').textContent,/not connected/);
 const badHistory=await harness({history:{messages:null}});assert.equal(badHistory.find('.assistant-chat-send').disabled,true);
});

test('success renders actual replies safely, clears only the acknowledged draft, and survives navigation',async()=>{
 const outcome=deferred();const h=await harness({handler:call=>call.options.method==='POST'?outcome.promise:undefined});
 const text='<img src=x onerror=alert(1)>',answer='<script>evil()</script> Actual answer.';
 await h.change(text);const sending=h.submit();
 const post=h.calls.at(-1);assert.equal(post.options.method,'POST');assert.equal(post.body.message,text);
 assert.equal(h.find('.assistant-chat-send').disabled,true);assert.equal(h.draft,text);
 assert.match(h.find('#assistant-chat-runtime').textContent,/Thinking/);
 assert.equal(h.find('.assistant-chat-turn-assistant'),null);
 await h.submit();assert.equal(h.calls.filter(c=>c.body).length,1);
 h.unmount();outcome.resolve(reply(completed(post.body.requestId,text,answer)));await sending;
 assert.equal(h.draft,'');h.mount();
 assert.equal(h.find('.assistant-chat-turn-assistant').textContent,'AI Assist '+answer);
 assert.equal(h.htmlWrites.some(value=>String(value).includes('<script>')||String(value).includes('<img')),false);
 assert.equal(h.find('.assistant-chat-turn-user').textContent,'You '+text);
});

test('unknown outcome retries exactly the same request and preserves a newer edited draft',async()=>{
 let posts=0;const h=await harness({handler:call=>{if(!call.body)return;if(++posts===1)throw new Error('Lost response');return reply(completed(call.body.requestId,call.body.message));}});
 await h.submit();const first=h.calls.find(c=>c.body).body;
 assert.equal(h.draft,'Help with this bid.');assert.match(h.find('#assistant-chat-runtime').textContent,/could not be confirmed/);
 await h.change('My next question.');assert.equal(h.find('.assistant-chat-send').disabled,true);
 await h.retry();const requests=h.calls.filter(c=>c.body);
 assert.equal(requests.length,2);assert.deepEqual(requests[1].body,first);
 assert.equal(h.draft,'My next question.');assert.equal(h.find('.assistant-chat-send').disabled,false);
});

test('terminal errors preserve draft and permit a new request only on an explicit resubmit',async()=>{
 let posts=0;const h=await harness({handler:call=>{if(!call.body)return;return ++posts===1?reply({error:'Allowance reached',code:'request_failed',terminal:true},429):reply(completed(call.body.requestId,call.body.message));}});
 await h.submit();const first=h.calls.find(c=>c.body).body;
 assert.equal(h.draft,first.message);assert.match(h.find('#assistant-chat-runtime').textContent,/current limit/);
 assert.equal(h.find('.assistant-chat-send').disabled,false);assert.equal(h.find('.assistant-chat-turn-user'),null);
 assert.equal(h.calls.filter(c=>c.body).length,1);
 await h.change('Revised question');await h.submit();const last=h.calls.at(-1).body;
 assert.notEqual(last.requestId,first.requestId);assert.equal(last.message,'Revised question');assert.equal(h.draft,'');
});

test('reload recovers the existing pending request without creating a new ID or duplicate user turn',async()=>{
 const requestId='a8dd1349-f781-4e77-92bd-cd34bfd43745',message='Previous message';
 const h=await harness({initialDraft:message,history:{messages:[],pending:true,pendingRequest:{requestId,message}},handler:call=>call.body?reply(completed(call.body.requestId,call.body.message)):undefined});
 assert.equal(h.find('.assistant-chat-send').disabled,true);
 assert.equal(h.find('.assistant-chat-turn-user').textContent,'You Previous message Reply not confirmed');
 assert.equal(h.calls.filter(c=>c.body).length,0);
 await h.retry();assert.equal(h.calls.at(-1).body.requestId,requestId);assert.equal(h.draft,'');
 assert.equal(h.find('.assistant-chat-turn-user').textContent,'You Previous message');
});

test('request conflict reconciles server pending identity before any further POST',async()=>{
 const canonical={requestId:'a8dd1349-f781-4e77-92bd-cd34bfd43745',message:'Message from another tab'};
 let posts=0,historyReads=0;
 const h=await harness({handler:call=>{
  if(call.body)return ++posts===1?reply({error:'Another message is pending',code:'request_pending'},409):reply(completed(call.body.requestId,call.body.message));
  if(call.path.endsWith('/chat')&&++historyReads>1)return reply({messages:[],pending:true,pendingRequest:canonical});
 }});
 await h.submit();assert.equal(posts,1);
 await h.retry();assert.equal(posts,1);assert.match(h.find('.assistant-chat-turn-user').textContent,/Message from another tab/);
 await h.retry();assert.equal(posts,2);assert.deepEqual(h.calls.at(-1).body,canonical);
 assert.equal(h.draft,'Help with this bid.');
});

test('account change aborts requests and ignores a late private reply',async()=>{
 const outcome=deferred(),h=await harness({handler:call=>call.body?outcome.promise:undefined});
 const sending=h.submit(),post=h.calls.at(-1);h.account.invalidate();
 assert.equal(post.options.signal.aborted,true);outcome.resolve(reply(completed(post.body.requestId,post.body.message,'PRIVATE OLD ACCOUNT')));await sending;
 assert.equal(h.find('.assistant-chat-body'),null);assert.equal(h.sent.length,0);
 await h.submit();assert.equal(h.calls.filter(c=>c.body).length,1);
});

test('pagehide aborts and a restored page ignores the old reply while reloading history',async()=>{
 const outcome=deferred(),h=await harness({handler:call=>call.body?outcome.promise:undefined});
 const sending=h.submit(),post=h.calls.at(-1);h.window.dispatchEvent(new Event('pagehide'));
 assert.equal(post.options.signal.aborted,true);
 const restored=new Event('pageshow');Object.defineProperty(restored,'persisted',{value:true});h.window.dispatchEvent(restored);await tick();
 outcome.resolve(reply(completed(post.body.requestId,post.body.message,'STALE RESPONSE')));await sending;
 assert.equal(h.sent.length,0);assert.equal(h.find('.assistant-chat-turn-assistant'),null);
 assert.equal(h.calls.filter(c=>!c.body).length,4);
});

test('malformed success stays unconfirmed and timed out requests keep the same retry ID',async()=>{
 let count=0;const h=await harness({handler:call=>{
  if(!call.body)return;
  if(++count===1)return reply({ok:true,requestId:call.body.requestId,reply:'Unproven answer',messages:[]});
  return new Promise((_,reject)=>call.options.signal.addEventListener('abort',()=>reject(new Error('Timeout')),{once:true}));
 }});
 await h.submit();assert.equal(h.find('.assistant-chat-turn-assistant'),null);const id=h.calls.at(-1).body.requestId;
 const retry=h.submit();await h.expire(75000);await retry;
 assert.equal(h.calls.at(-1).body.requestId,id);assert.equal(h.draft,'Help with this bid.');
 assert.match(h.find('#assistant-chat-runtime').textContent,/could not be confirmed/);
});

test('unavailable and rate-limited uncertain responses preserve the same safe retry identity',async()=>{
 for(const status of [503,429]){
  const h=await harness({handler:call=>call.body?reply({error:'Try again later',code:'outcome_unknown'},status):undefined});
  await h.submit();const original=h.calls.at(-1).body;
  assert.equal(h.draft,original.message);assert.equal(h.find('.assistant-chat-send').disabled,true);
  assert.match(h.find('#assistant-chat-runtime').textContent,status===503?/temporarily unavailable/:/current limit/);
  await h.retry();assert.deepEqual(h.calls.at(-1).body,original);
 }
});

test('authorization errors clear private chat and malformed readiness never enables send',async()=>{
 for(const status of [401,403]){
  const h=await harness({handler:call=>call.body?reply({error:'Account access changed',code:'account_changed'},status):undefined});
  await h.submit();assert.equal(h.account.locked,true);assert.equal(h.find('.assistant-chat-body'),null);
  assert.equal(h.sent.length,0);await h.submit();assert.equal(h.calls.filter(call=>call.body).length,1);
 }
 const h=await harness({handler:call=>call.path.endsWith('/status')?reply(null):undefined});
 assert.equal(h.find('.assistant-chat-send').disabled,true);await h.submit();assert.equal(h.calls.filter(call=>call.body).length,0);
});

test('history action receipts render after bridge loading without replaying navigation or review',async()=>{
 const action={id:'9dd562cf-d059-4a5d-8875-70c66d19472b',kind:'navigate',screen:'calendar'},received=[],renders=[];
 const h=await harness({history:{messages:[{id:'old-assistant',role:'assistant',content:'Ready to review.',actions:[action]}],pending:false}});
 h.window.XtremeAssistantActions={receive(...args){received.push(args);},render(actions){renders.push(actions);const node=h.makeNode('section');node.textContent='Review action';return node;}};
 h.window.dispatchEvent(new Event('xtreme:assistant-actions-ready'));assert.equal(renders.length,1);assert.equal(received.length,0);assert.match(h.find('.assistant-chat-turn-assistant').textContent,/Review action/);
 h.mount();assert.equal(received.length,0);
});

test('only a verified live reply delivers its structured action receipts once to a late bridge',async()=>{
 const action={id:'9dd562cf-d059-4a5d-8875-70c66d19472b',kind:'navigate',screen:'calendar'},received=[];
 const h=await harness({handler:call=>call.body?reply({...completed(call.body.requestId,call.body.message),actions:[action]}):undefined});await h.submit();const rid=h.calls.find(call=>call.body).body.requestId;
 h.window.XtremeAssistantActions={receive(actions,context){received.push({actions,context});},render(){return h.makeNode('section');}};
 h.window.dispatchEvent(new Event('xtreme:assistant-actions-ready'));assert.equal(received.length,1);assert.equal(received[0].context.requestId,rid);assert.equal(received[0].context.source,'chat');assert.equal(received[0].context.automatic,true);
 h.window.dispatchEvent(new Event('xtreme:assistant-actions-ready'));h.mount();assert.equal(received.length,1);
});

test('account end discards queued actions before an action bridge can load',async()=>{
 const received=[],h=await harness({handler:call=>call.body?reply({...completed(call.body.requestId,call.body.message),actions:[{id:'9dd562cf-d059-4a5d-8875-70c66d19472b',kind:'navigate',screen:'calendar'}]}):undefined});await h.submit();h.account.invalidate();
 h.window.XtremeAssistantActions={receive(...args){received.push(args);},render(){return h.makeNode('section');}};h.window.dispatchEvent(new Event('xtreme:assistant-actions-ready'));assert.equal(received.length,0);
});

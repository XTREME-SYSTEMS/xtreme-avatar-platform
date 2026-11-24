import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleAccounts} from '../server/accounts.mjs';
import {handleAssistant} from '../server/assistant.mjs';

const ORIGIN='https://xtreme.example.test';
const OWNER={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test'},ALICE={id:'22222222-2222-4222-8222-222222222222',email:'alice@example.test'},BOB={id:'33333333-3333-4333-8333-333333333333',email:'bob@example.test'};
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_unknown_blazing_skull.sql',import.meta.url),'utf8'));
 const statement=(sql,args=[])=>({bind(...next){return statement(sql,next)},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return{results:sqlite.prepare(sql).all(...args)}},async run(){const r=sqlite.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}}}});
 const env={DB:{prepare:statement},XTREME_OWNER_EMAIL:OWNER.email,XTREME_ASSISTANT_SECRET:'a'.repeat(64),ASSISTANT_SITES_TOKEN:'test-server-dispatch-token'};
 // The Edge boundary supplies verified AUTH_USER; platform headers never do.
 // These tests retain the legacy service transport to exercise its HMAC contract.
 // PostgreSQL/RLS and v2 bearer behavior have dedicated migration test suites.
 sqlite.prepare("INSERT INTO members(user_id,email,role,status,created_at) VALUES(?,?,'owner','active',?)").run(OWNER.id,OWNER.email,'2026-11-07T00:00:00Z');
 function envFor(identity){
  const user=identity?{...identity,email_confirmed_at:'2026-11-07T00:00:00Z',is_anonymous:false}:null;
  return {...env,AUTH_USER:user,DB:{...env.DB,async admitVerifiedMember(){
   if(!user)return;
   const invitation=sqlite.prepare("SELECT role FROM invitations WHERE email=? AND status='active'").get(user.email);
   if(invitation)sqlite.prepare("INSERT OR IGNORE INTO members(user_id,email,role,status,created_at) VALUES(?,?,?,'active',?)").run(user.id,user.email,invitation.role,'2026-11-07T00:00:00Z');
  }}};
 }
 const calls=[];let upstream=async(_url,init)=>{const body=JSON.parse(init.body);return new Response(JSON.stringify(_url.endsWith('/status')?{chat:{ready:true},voice:{ready:true}}:{ok:true,requestId:body.requestId,reply:'Answer to '+body.messages.at(-1).content}),{headers:{'content-type':'application/json'}})};
 function req(identity,path,input,extra={}){return new Request(ORIGIN+path,{method:input===undefined?'GET':'POST',headers:{...(identity?{'x-xtreme-account':identity.id}:{}),...(input===undefined?{}:{origin:ORIGIN,'content-type':'application/json'}),...extra},body:input===undefined?undefined:JSON.stringify(input)})}
 async function request(identity,path='/api/assistant/chat',input,extra={}){const r=await handleAssistant(req(identity,path,input,extra),envFor(identity),async(url,init)=>{calls.push({url,init});return upstream(url,init)});return{status:r.status,headers:r.headers,body:await r.json()}}
 async function invite(identity){const invitation=await handleAccounts(req(OWNER,'/api/team',{action:'invite',email:identity.email,role:'member'}),envFor(OWNER));assert.equal(invitation.status,200);const member=await handleAccounts(req(identity,'/api/account'),envFor(identity));assert.equal(member.status,200);assert.equal((await member.json()).user.id,identity.id)}
 return{env,envFor,sqlite,calls,request,invite,upstream(fn){upstream=fn}};
}
const input=message=>({requestId:crypto.randomUUID(),message});
test('assistant denies anonymous, uninvited and cross-origin use without service calls',async()=>{const f=fixture();assert.equal((await f.request(null)).status,401);assert.equal((await f.request(ALICE)).status,403);await f.invite(ALICE);assert.equal((await f.request(ALICE,'/api/assistant/chat',input('hello'),{origin:'https://bad.test'})).status,403);assert.equal(f.calls.length,0)});
test('chat stores private history and sends only current user context',async()=>{const f=fixture();await f.invite(ALICE);await f.invite(BOB);const a=await f.request(ALICE,'/api/assistant/chat',input('ALICE PRIVATE'));assert.equal(a.status,200);assert.equal(a.body.messages.length,2);assert.equal((await f.request(BOB)).body.messages.length,0);await f.request(BOB,'/api/assistant/chat',input('BOB PRIVATE'));assert.ok(!f.calls.at(-1).init.body.includes('ALICE'));assert.equal((await f.request(ALICE)).body.messages[0].content,'ALICE PRIVATE');assert.equal((await f.request(ALICE)).headers.get('cache-control'),'private, no-store')});
test('legacy service signatures bind fixed path, body and opaque subject; never forward email',async()=>{const f=fixture();await f.invite(ALICE);await f.request(ALICE,'/api/assistant/chat',input('hello'));const c=f.calls[0];assert.equal(c.url,'https://eden-skye-call-desk.strategic-ai.chatgpt.site/assistant/v1/chat');assert.equal(c.init.redirect,'manual');const h=c.init.headers;assert.match(h['X-Xtreme-Signature'],/^[0-9a-f]{64}$/);assert.match(h['X-Xtreme-User-Id'],/^[0-9a-f]{64}$/);assert.ok(!JSON.stringify(c).includes(ALICE.email));const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(c.init.body))).toString('hex');const canonical=JSON.stringify(['xtreme-assistant-v1',h['X-Xtreme-App-Id'],h['X-Xtreme-User-Id'],'POST','/assistant/v1/chat',h['X-Xtreme-Timestamp'],h['X-Xtreme-Nonce'],hash]);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.env.XTREME_ASSISTANT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);assert.equal(await crypto.subtle.verify('HMAC',key,Buffer.from(h['X-Xtreme-Signature'],'hex'),new TextEncoder().encode(canonical)),true)});
test('idempotent completed retry avoids another inference and altered message is rejected',async()=>{const f=fixture();await f.invite(ALICE);const body=input('first');assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).status,200);assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).status,200);assert.equal(f.calls.length,1);assert.equal((await f.request(ALICE,'/api/assistant/chat',{...body,message:'different'})).body.code,'request_conflict')});
test('unknown result retains recoverable request and blocks a different message',async()=>{const f=fixture();await f.invite(ALICE);f.upstream(async()=>{throw Error('offline')});const body=input('recover me');assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).body.code,'outcome_unknown');const state=await f.request(ALICE);assert.deepEqual(state.body.pendingRequest,body);assert.equal((await f.request(ALICE,'/api/assistant/chat',input('new'))).body.code,'request_pending');assert.equal(f.calls.length,1);f.upstream(async(_url,init)=>new Response(JSON.stringify({ok:true,requestId:JSON.parse(init.body).requestId,reply:'recovered'})));assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).body.reply,'recovered');assert.equal(f.calls[1].init.body,f.calls[0].init.body);assert.equal((await f.request(ALICE)).body.pending,false)});
test('terminal provider failure releases pending but same failed request is never resubmitted',async()=>{const f=fixture();await f.invite(ALICE);f.upstream(async()=>new Response(JSON.stringify({code:'provider_failed',terminal:true}),{status:502}));const body=input('failed');assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).body.terminal,true);assert.equal((await f.request(ALICE)).body.pending,false);assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).body.terminal,true);assert.equal(f.calls.length,1)});
test('account switching and suspension deny inference and hide late answers',async()=>{const f=fixture();await f.invite(ALICE);await f.invite(BOB);assert.equal((await f.request(BOB,'/api/assistant/chat',input('oldtab'),{'x-xtreme-account':ALICE.id})).body.code,'account_changed');assert.equal(f.calls.length,0);f.upstream(async(_url,init)=>{f.sqlite.prepare("UPDATE members SET status='suspended' WHERE user_id=?").run(ALICE.id);return new Response(JSON.stringify({ok:true,requestId:JSON.parse(init.body).requestId,reply:'PRIVATE'}))});const late=await f.request(ALICE,'/api/assistant/chat',input('hello'));assert.equal(late.status,502);assert.equal(late.body.code,'outcome_unknown');assert.doesNotMatch(JSON.stringify(late.body),/PRIVATE/);const durable=f.sqlite.prepare('SELECT status,reply FROM assistant_turns WHERE user_id=?').get(ALICE.id);assert.equal(durable.status,'pending');assert.equal(durable.reply,null);assert.equal((await f.request(ALICE)).status,403);assert.deepEqual((await f.request(BOB)).body.messages,[])});
test('malformed input and missing credentials fail before inference',async()=>{const f=fixture();await f.invite(ALICE);for(const body of [{...input('hello'),userId:BOB.id},input('x'.repeat(4001)),input(''),{requestId:'notuuid',message:'hello'}])assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).status,400);delete f.env.ASSISTANT_SITES_TOKEN;assert.equal((await f.request(ALICE,'/api/assistant/chat',input('hello'))).status,503);assert.equal(f.calls.length,0);assert.equal((await f.request(ALICE)).body.pending,false)});
test('voice never inherits chat readiness and unknown upstream paths stay closed',async()=>{const f=fixture();await f.invite(ALICE);const r=await f.request(ALICE,'/api/assistant/status');assert.equal(r.body.chat.ready,true);assert.equal(r.body.voice.ready,false);for(const path of ['/api/assistant/voice','/api/assistant/chat?user_id=bob','/api/assistant/mcp'])assert.equal((await f.request(ALICE,path)).status,404)});
test('old tab cannot read a switched account history or readiness',async()=>{const f=fixture();await f.invite(ALICE);await f.invite(BOB);await f.request(BOB,'/api/assistant/chat',input('BOB PRIVATE'));const count=f.calls.length;for(const path of ['/api/assistant/chat','/api/assistant/status']){const r=await f.request(BOB,path,undefined,{'x-xtreme-account':ALICE.id});assert.equal(r.status,409);assert.equal(r.body.code,'account_changed');assert.ok(!JSON.stringify(r.body).includes('BOB PRIVATE'));}assert.equal(f.calls.length,count)});

function preference(f,user,key,value){f.sqlite.prepare("INSERT INTO private_state(user_id,key,value,version,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,version=private_state.version+1").run(user.id,key,JSON.stringify(value),new Date().toISOString());}

test('new chat turns use the current member persona and skill preferences while preserving raw history',async()=>{
 const f=fixture();await f.invite(ALICE);await f.invite(BOB);
 preference(f,ALICE,'model','maya');preference(f,ALICE,'assistant_preferences',{autonomy:'copilot',skills:['proposal_drafting','bid_estimation']});
 preference(f,BOB,'model','atlas');preference(f,BOB,'assistant_preferences',{autonomy:'supervised',skills:['simulation']});
 const result=await f.request(ALICE,'/api/assistant/chat',input('Please draft a scope.'));
 assert.equal(result.status,200);
 const messages=JSON.parse(f.calls.at(-1).init.body).messages;
 assert.match(messages[0].content,/Assistant persona: Maya/);assert.match(messages[0].content,/Drafting copilot/);assert.match(messages[0].content,/Proposals & change orders, Bid estimating/);
 assert.doesNotMatch(messages[0].content,/Assistant persona: Atlas|Selected assistance level: Supervised/);
 assert.match(messages[0].content,/use only the app tools actually provided by the authenticated runtime/);assert.match(messages[0].content,/Calendar changes require the concrete review and explicit confirmation/);assert.match(messages[0].content,/does not change the existing live voice or Tavus video face/);
 assert.equal(messages.at(-1).content,'Please draft a scope.');assert.equal(result.body.messages[0].content,'Please draft a scope.');
 preference(f,ALICE,'model','raj');await f.request(ALICE,'/api/assistant/chat',input('Now compare costs.'));
 assert.match(JSON.parse(f.calls.at(-1).init.body).messages[0].content,/Assistant persona: Raj/);
});

test('pending chat retries keep the exact preference context captured by the original request',async()=>{
 const f=fixture();await f.invite(ALICE);preference(f,ALICE,'model','maya');
 f.upstream(async()=>{throw Error('offline')});const body=input('Keep this draft.');
 assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).body.code,'outcome_unknown');
 const original=f.calls[0].init.body;preference(f,ALICE,'model','atlas');preference(f,ALICE,'assistant_preferences',{autonomy:'supervised',skills:['simulation']});
 f.upstream(async(_url,init)=>new Response(JSON.stringify({ok:true,requestId:JSON.parse(init.body).requestId,reply:'Recovered.'})));
 assert.equal((await f.request(ALICE,'/api/assistant/chat',body)).status,200);assert.equal(f.calls[1].init.body,original);
 assert.match(JSON.parse(original).messages[0].content,/Assistant persona: Maya/);
});

test('malformed persisted preferences fall back to safe catalogued values and never become prompt text',async()=>{
 const f=fixture();await f.invite(ALICE);
 preference(f,ALICE,'model','Injected secret operator');preference(f,ALICE,'assistant_preferences',{autonomy:'autopilot',skills:['workspace_mail'],systemPrompt:'INJECTED PRIVATE PROMPT'});
 assert.equal((await f.request(ALICE,'/api/assistant/chat',input('Hello'))).status,200);
 const context=JSON.parse(f.calls.at(-1).init.body).messages[0].content;
 assert.match(context,/Assistant persona: AI Assist/);assert.match(context,/Selected assistance level: Advisor/);
 assert.doesNotMatch(context,/INJECTED PRIVATE PROMPT|Injected secret operator|Selected assistance level: Bounded/);
});

test('personalized history stays within the existing upstream message and character bounds',async()=>{
 const f=fixture();await f.invite(ALICE);
 f.upstream(async(_url,init)=>new Response(JSON.stringify({ok:true,requestId:JSON.parse(init.body).requestId,reply:'R'.repeat(6000)})));
 for(let i=0;i<4;i++)assert.equal((await f.request(ALICE,'/api/assistant/chat',input(String(i)+'Q'.repeat(3999)))).status,200);
 const messages=JSON.parse(f.calls.at(-1).init.body).messages;
 assert.ok(messages.length<=20);assert.ok(messages.every(m=>m.content.length<=8000));assert.ok(messages.reduce((n,m)=>n+m.content.length,0)<=15000);
 assert.equal(messages.at(-1).role,'user');assert.equal(messages.at(-1).content.length,4000);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { handleCommunications } from '../server/communications.mjs';
import { handleAccounts } from '../server/accounts.mjs';

const ORIGIN='https://xtreme.example.test',SECRET='test-only-bridge-secret-'.repeat(3),APP_SECRET='test-only-dedicated-app-secret-'.repeat(3);
const APP='appgprj_6aec7688554c819181a5cae574c92008',SERVICE='https://eden-outbound-call-sandbox-code.up.railway.app';
const owner={id:'owner-id',email:'owner@example.test'},admin={id:'admin-id',email:'admin@example.test'};
const prepare={request_id:'test-request-1',to:'+15550001111',purpose:'Discuss the presentation',mode:'eden_speaks',recipient_timezone:'America/New_York',recipient_name:'Sam'};
const receipt={call_id:'call_1',to:prepare.to,purpose:prepare.purpose,mode:prepare.mode,state:'prepared',expires_at:Date.now()/1000+600,max_seconds:180,recipient_name:'Sam'};
const conferenceArgs={request_id:'conference-1',purpose:'Presentation call',operator_timezone:'America/New_York',recipients:[{to:'+15550002222',recipient_timezone:'America/New_York'},{to:'+15550003333',recipient_timezone:'America/New_York'}]};
const room={conference_id:'room_1',purpose:conferenceArgs.purpose,max_seconds:180,steps:['+15550001111','+15550002222','+15550003333'].map((to,i)=>({step:i+1,to,state:'planned',consented_on_phone:false,joined_room:false}))};
function fixture({hmac=false}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_unknown_blazing_skull.sql',import.meta.url),'utf8'));
 let failWrites=false,beforeFetch=null,beforeRun=null;
 function statement(sql,args=[]){return {bind(...next){return statement(sql,next);},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){if(beforeRun)beforeRun(sql,args);if(failWrites&&sql.includes('private_state'))throw new Error('Storage unavailable');return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}
 const env={DB:{prepare:statement},XTREME_OWNER_EMAIL:owner.email,XTREME_ADMIN_EMAIL:admin.email,BRIDGE_URL:'https://eden-outbound-call-sandbox-code.up.railway.app',BRIDGE_TOKEN:SECRET};
 if(hmac){env.XTREME_ASSISTANT_SECRET=APP_SECRET;delete env.BRIDGE_URL;delete env.BRIDGE_TOKEN;}
 const sent=[];let response=receipt,transportError=false,rawError=null,override=null;
 const fetcher=async(url,init)=>{sent.push({url,init,rpc:JSON.parse(init.body)});if(beforeFetch)await beforeFetch();if(transportError)throw new Error('provider secret '+SECRET);if(override)return new Response(JSON.stringify(override.body),{status:override.status});if(hmac)return new Response(JSON.stringify(rawError?{ok:false,reason:'operation_rejected',error:rawError}:{ok:true,data:response}),{status:rawError?409:200});if(rawError)return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{isError:true,content:[{type:'text',text:rawError}]}}));return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify(response)}]}}));};
 async function request(action,args={},token,options={}){
  const user=options.user===undefined?owner:options.user,headers={origin:ORIGIN,'content-type':'application/json',...(user?{'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email,'x-xtreme-account':user.id}:{}),...options.headers};
  const method=options.method||'POST',body={action,args,...(token?{review_token:token}:{}),...options.extra};
  const res=await handleCommunications(new Request(ORIGIN+'/api/communications',{method,headers,body:method==='POST'?JSON.stringify(body):undefined}),env,{fetch:fetcher});
  return {status:res.status,headers:res.headers,body:await res.json()};
 }
 return {env,sqlite,sent,request,setResponse(v){response=v;},setError(v){rawError=v;},setRawResponse(body,status=200){override={body,status};},breakTransport(){transportError=true;},failWrites(v){failWrites=v;},beforeFetch(fn){beforeFetch=fn;},beforeRun(fn){beforeRun=fn;}};
}
const start=overrides=>({call_id:'call_1',confirm_to:prepare.to,confirm_purpose:prepare.purpose,recipient_consented:true,approve_charges:true,...overrides});
test('only active owner with unchanged identity and same origin reaches bridge',async()=>{
 const f=fixture();
 assert.equal((await f.request('readiness',{},null,{user:null})).status,401);
 assert.equal((await f.request('readiness',{},null,{user:admin})).status,403);
 assert.equal((await f.request('readiness',{},null,{headers:{origin:'https://attacker.example'}})).status,403);
 assert.equal((await f.request('readiness',{},null,{headers:{'x-xtreme-account':'someone-else'}})).status,409);
 assert.equal((await f.request('readiness',{},null,{method:'GET'})).status,405);
 assert.equal(f.sent.length,0);
 await f.request('prepare',prepare);f.sqlite.prepare("UPDATE members SET status='suspended' WHERE user_id=?").run(owner.id);
 assert.equal((await f.request('readiness')).status,403);assert.equal(f.sent.length,1);
});
test('strict request and fixed server binding reject arbitrary forwarding',async()=>{
 const f=fixture();assert.equal((await f.request('raw',{url:'https://attacker.test'})).status,400);
 assert.equal((await f.request('prepare',{...prepare,evil:true})).status,400);
 assert.equal((await f.request('prepare',{...prepare,recipient_timezone:'not-a-zone'})).status,400);
 assert.equal((await f.request('start',start({call_id:null}),'bad')).status,400);
 assert.equal((await f.request('readiness',{},null,{extra:{url:'https://attacker.test'}})).status,400);
 f.env.BRIDGE_URL='https://attacker.test';assert.equal((await f.request('readiness')).body.code,'bridge_unlinked');
 assert.equal(f.sent.length,0);
});
test('prepare returns safe receipt and signed review, start requires exact review confirmations',async()=>{
 const f=fixture();f.setResponse({...receipt,secret:SECRET,provider_response:{token:SECRET}});
 const prep=await f.request('prepare',prepare);assert.equal(prep.status,200);assert.ok(prep.body.review_token);assert.ok(!JSON.stringify(prep.body).includes(SECRET));
 assert.equal(prep.headers.get('cache-control'),'private, no-store');
 assert.equal((await f.request('start',start())).body.code,'review_required');
 assert.equal((await f.request('start',start({confirm_to:'+15559999999'}),prep.body.review_token)).body.code,'review_mismatch');
 assert.equal((await f.request('start',start({confirm_purpose:'Changed'}),prep.body.review_token)).body.code,'review_mismatch');
 assert.equal((await f.request('start',start({recipient_consented:false}),prep.body.review_token)).status,400);
 assert.equal((await f.request('start',start({approve_charges:false}),prep.body.review_token)).status,400);
 assert.equal(f.sent.length,1);
 f.setResponse({...receipt,state:'queued',sid:'CA'+'1'.repeat(32)});
 const result=await f.request('start',start(),prep.body.review_token);assert.equal(result.status,200);assert.equal(result.body.data.state,'queued');
 assert.equal(f.sent[1].rpc.params.name,'eden_start');assert.equal(f.sent[1].url,f.env.BRIDGE_URL+'/mcp');assert.equal(f.sent[1].init.redirect,'manual');
 assert.equal(f.sent[1].init.headers.authorization,'Bearer '+SECRET);
 assert.equal(JSON.stringify(f.sent[1].rpc).includes('review_token'),false);
});
test('tampered tokens, wrong call and account are denied before upstream',async()=>{
 const f=fixture(),prep=await f.request('prepare',prepare),token=prep.body.review_token;
 const [body,sig]=token.split('.'),payload=JSON.parse(Buffer.from(body,'base64url'));payload.to='+15559999999';
 const changed=Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+sig;
 assert.equal((await f.request('start',start({confirm_to:payload.to}),changed)).body.code,'review_required');
 assert.equal((await f.request('status',{call_id:'different_call'},token)).body.code,'review_mismatch');
 f.sqlite.prepare("INSERT INTO members(user_id,email,role,status,created_at) VALUES('owner-new','new@example.test','owner','active','now')").run();
 assert.equal((await f.request('status',{call_id:'call_1'},token,{user:{id:'owner-new',email:'new@example.test'}})).body.code,'review_mismatch');
 assert.equal(f.sent.length,1);
});
test('expired review blocks dialing but preserves status and stop controls',async()=>{
 const f=fixture();f.setResponse({...receipt,expires_at:Date.now()/1000-5});const prep=await f.request('prepare',prepare),token=prep.body.review_token;
 assert.equal((await f.request('start',start(),token)).body.code,'review_expired');
 assert.equal((await f.request('status',{call_id:'call_1',local_only:true},token)).status,200);
 f.setResponse({...receipt,state:'canceled',stop_requested:true});assert.equal((await f.request('hangup',{call_id:'call_1'},token)).status,200);
});
test('three-way binds every human participant and each exact leg',async()=>{
 const f=fixture();f.setResponse(room);const prep=await f.request('conference_prepare',conferenceArgs);assert.equal(prep.status,200);assert.equal(prep.body.data.human_only,true);
 const dial={conference_id:'room_1',step:1,confirm_to:room.steps[0].to,confirm_purpose:room.purpose,recipient_consented:true,approve_charges:true};
 assert.equal((await f.request('conference_dial_leg',{...dial,step:2},prep.body.review_token)).body.code,'review_mismatch');
 assert.equal((await f.request('conference_dial_leg',dial,prep.body.review_token)).status,200);
 assert.equal(f.sent.at(-1).rpc.params.name,'eden_conference_dial_leg');
 assert.equal((await f.request('conference_status',{conference_id:'room_1'},prep.body.review_token)).status,200);
 assert.equal((await f.request('conference_end',{conference_id:'room_1'},prep.body.review_token)).status,200);
});
test('receipt mismatch fails closed and transport failures never auto retry',async()=>{
 const f=fixture();f.setResponse({...receipt,to:'+15559999999'});assert.equal((await f.request('prepare',prepare)).body.code,'bridge_receipt_invalid');
 f.setResponse(receipt);const prep=await f.request('prepare',prepare);f.breakTransport();
 const result=await f.request('start',start(),prep.body.review_token);assert.equal(result.body.code,'bridge_outcome_unknown');assert.equal(f.sent.length,3);assert.ok(!JSON.stringify(result.body).includes(SECRET));
});
test('provider errors and unknown readiness fields cannot leak credentials',async()=>{
 const f=fixture();f.setError('Internal exception includes '+SECRET);const result=await f.request('prepare',prepare);assert.equal(result.body.code,'bridge_rejected');assert.ok(!JSON.stringify(result.body).includes(SECRET));
 f.setError(null);f.setResponse({daily_call_remaining_utc:2,max_seconds:180,secret:SECRET,modes:{eden_speaks:{configuration_missing:[]}},extensions:{three_way:{configured:false,missing:['EDEN_THREE_WAY_ENABLED',SECRET]}}});
 const r=await f.request('readiness');assert.equal(r.status,200);assert.equal(r.body.data.daily_call_remaining_utc,2);assert.equal(r.body.data.human_only_conference,true);assert.ok(!JSON.stringify(r.body).includes(SECRET));
});
test('reload resumes durable review without calling or renewing its original expiry',async()=>{
 const f=fixture();assert.equal((await f.request('resume')).body.data,null);assert.equal(f.sent.length,0);
 const prep=await f.request('prepare',prepare),old=JSON.parse(Buffer.from(prep.body.review_token.split('.')[0],'base64url'));
 const resumed=await f.request('resume');assert.equal(resumed.body.kind,'call');assert.equal(resumed.body.data.call_id,'call_1');assert.equal(f.sent.length,1);
 const fresh=JSON.parse(Buffer.from(resumed.body.review_token.split('.')[0],'base64url'));assert.equal(fresh.expires,old.expires);assert.equal(fresh.owner,owner.id);
 assert.equal((await f.request('resume',{},null,{user:admin})).status,403);
 assert.equal((await f.request('resume',{},null,{headers:{'x-xtreme-account':'other'}})).status,409);
 f.sqlite.prepare("UPDATE members SET status='suspended' WHERE user_id=?").run(owner.id);assert.equal((await f.request('resume')).status,403);
});
test('pending call is durably recorded before dialing and survives an unknown outcome',async()=>{
 const f=fixture(),prep=await f.request('prepare',prepare);let observed=false;
 f.beforeFetch(()=>{const r=JSON.parse(f.sqlite.prepare("SELECT value FROM private_state WHERE user_id=? AND key='call_review'").get(owner.id).value);assert.equal(r.pending,true);assert.equal(r.data.state,'submitting');observed=true;});f.breakTransport();
 assert.equal((await f.request('start',start(),prep.body.review_token)).body.code,'bridge_outcome_unknown');assert.equal(observed,true);
 const resumed=await f.request('resume');assert.equal(resumed.body.data.state,'submitting');assert.equal(resumed.body.recovery_pending,true);
 assert.equal((await f.request('prepare',{...prepare,request_id:'another'})).body.code,'call_unresolved');assert.equal(f.sent.length,2);
 assert.equal((await f.request('start',start(),resumed.body.review_token)).body.code,'call_unresolved');assert.equal(f.sent.length,2);
});
test('failed durable write prevents dialing; failed later receipt write retains recovery',async()=>{
 const f=fixture(),prep=await f.request('prepare',prepare);f.failWrites(true);
 assert.equal((await f.request('start',start(),prep.body.review_token)).status,503);assert.equal(f.sent.length,1);
 f.failWrites(false);f.beforeFetch(()=>f.failWrites(true));f.setResponse({...receipt,state:'queued'});
 const started=await f.request('start',start(),prep.body.review_token);assert.equal(started.status,200);assert.equal(started.body.recovery_pending,true);
 const resumed=await f.request('resume');assert.equal(resumed.body.data.state,'submitting');assert.equal(resumed.body.recovery_pending,true);
});
test('reserved recovery is neither exposed nor writable through the account API',async()=>{
 const f=fixture();await f.request('prepare',prepare);
 const headers={origin:ORIGIN,'content-type':'application/json','oai-authenticated-user-id':owner.id,'oai-authenticated-user-email':owner.email,'x-xtreme-account':owner.id};
 const account=await handleAccounts(new Request(ORIGIN+'/api/account',{headers}),f.env);assert.ok(!JSON.stringify(await account.json()).includes('call_review'));
 const forged=await handleAccounts(new Request(ORIGIN+'/api/account/state',{method:'POST',headers,body:JSON.stringify({key:'call_review',value:{arbitrary:'call'},version:1})}),f.env);assert.equal(forged.status,400);
});
test('stale delayed status cannot overwrite a newer review; old token cannot dial it',async()=>{
 const f=fixture(),prep=await f.request('prepare',prepare);let release;const wait=new Promise(r=>release=r);let entered;const atFetch=new Promise(r=>entered=r);
 f.beforeFetch(async()=>{f.beforeFetch(null);entered();await wait;});
 const status=f.request('status',{call_id:'call_1'},prep.body.review_token);await atFetch;
 const newerReceipt={...receipt,call_id:'call_2',to:'+15550002222',purpose:'A new purpose'};f.setResponse(newerReceipt);
 const newer=await f.request('prepare',{...prepare,request_id:'new-request',to:newerReceipt.to,purpose:newerReceipt.purpose});assert.equal(newer.status,200);
 f.setResponse(receipt);release();assert.equal((await status).status,200);
 const resumed=await f.request('resume');assert.equal(resumed.body.data.call_id,'call_2');
 assert.equal((await f.request('start',start(),prep.body.review_token)).body.code,'recovery_required');
});
test('concurrent recovery revision change prevents an outbound action',async()=>{
 const f=fixture(),prep=await f.request('prepare',prepare);
 f.beforeRun(sql=>{if(sql.startsWith('UPDATE private_state')){f.beforeRun(null);f.sqlite.prepare("UPDATE private_state SET version=version+1 WHERE user_id=? AND key='call_review'").run(owner.id);}});
 assert.equal((await f.request('start',start(),prep.body.review_token)).body.code,'recovery_conflict');assert.equal(f.sent.length,1);
});
test('prepared status overtaking an in-flight start cannot unlock or replace recovery',async()=>{
 const f=fixture(),prep=await f.request('prepare',prepare);let release,entered;
 const wait=new Promise(r=>release=r),atFetch=new Promise(r=>entered=r);
 f.beforeFetch(async()=>{f.beforeFetch(null);entered();await wait;});
 const starting=f.request('start',start(),prep.body.review_token);await atFetch;
 f.setResponse(receipt);const status=await f.request('status',{call_id:'call_1'},prep.body.review_token);
 assert.equal(status.body.recovery_pending,true);assert.equal(status.body.data.state,'submitting');
 const newerReceipt={...receipt,call_id:'call_2',purpose:'Other call'};f.setResponse(newerReceipt);
 assert.equal((await f.request('prepare',{...prepare,request_id:'another',purpose:newerReceipt.purpose})).body.code,'call_unresolved');
 f.setResponse({...receipt,state:'queued'});release();assert.equal((await starting).body.data.state,'queued');
 const resumed=await f.request('resume');assert.equal(resumed.body.data.call_id,'call_1');assert.equal(resumed.body.recovery_pending,true);
 const queued=await f.request('status',{call_id:'call_1'},prep.body.review_token);assert.equal(queued.body.data.state,'queued');
 assert.equal((await f.request('prepare',{...prepare,request_id:'another'})).body.code,'call_unresolved');
 f.setResponse({...receipt,state:'canceled'});await f.request('hangup',{call_id:'call_1'},prep.body.review_token);
 f.setResponse(newerReceipt);assert.equal((await f.request('prepare',{...prepare,request_id:'another',purpose:newerReceipt.purpose})).status,200);
});
test('planned conference status overtaking a dial leg preserves that room and pending leg',async()=>{
 const f=fixture();f.setResponse(room);const prep=await f.request('conference_prepare',conferenceArgs);let release,entered;
 const wait=new Promise(r=>release=r),atFetch=new Promise(r=>entered=r);
 f.beforeFetch(async()=>{f.beforeFetch(null);entered();await wait;});
 const args={conference_id:'room_1',step:1,confirm_to:room.steps[0].to,confirm_purpose:room.purpose,recipient_consented:true,approve_charges:true};
 const starting=f.request('conference_dial_leg',args,prep.body.review_token);await atFetch;
 const status=await f.request('conference_status',{conference_id:'room_1'},prep.body.review_token);
 assert.equal(status.body.recovery_pending,true);assert.equal(status.body.data.steps[0].state,'submitting');
 assert.equal((await f.request('conference_prepare',{...conferenceArgs,request_id:'new-room'})).body.code,'call_unresolved');
 const queued={...room,steps:room.steps.map((s,i)=>({...s,state:i===0?'queued':s.state}))};f.setResponse(queued);release();await starting;
 const resumed=await f.request('resume');assert.equal(resumed.body.data.conference_id,'room_1');assert.equal(resumed.body.recovery_pending,true);
 const updated=await f.request('conference_status',{conference_id:'room_1'},prep.body.review_token);assert.equal(updated.body.data.steps[0].state,'queued');
 assert.equal((await f.request('resume')).body.recovery_pending,false);
 f.setResponse({...room,ended:true,stop_requested:true,steps:room.steps.map(s=>({...s,state:'canceled'}))});
 assert.equal((await f.request('conference_end',{conference_id:'room_1'},prep.body.review_token)).status,200);
 assert.equal((await f.request('resume')).body.recovery_pending,false);
});
test('dedicated call capability signs fixed endpoint, opaque owner and exact body without exporting credentials',async()=>{
 const f=fixture({hmac:true});
 const prep=await f.request('prepare',prepare,null,{headers:{authorization:'Bearer browser-forgery','X-Xtreme-Signature':'browser-forgery','X-Xtreme-User-Id':'forged-owner'}});
 assert.equal(prep.status,200);
 const sent=f.sent[0],headers=sent.init.headers;
 const mac=value=>createHmac('sha256',APP_SECRET).update(value).digest('hex');
 const subject=mac(JSON.stringify(['xtreme-assistant-user-v1',APP,owner.id]));
 assert.equal(sent.url,SERVICE+'/assistant/v1/calls');assert.equal(sent.init.redirect,'manual');
 assert.deepEqual(sent.rpc,{action:'prepare',args:prepare,owner:true});
 assert.equal(headers['X-Xtreme-App-Id'],APP);assert.equal(headers['X-Xtreme-User-Id'],subject);assert.notEqual(subject,owner.id);
 assert.ok(Math.abs(Number(headers['X-Xtreme-Timestamp'])-Date.now()/1000)<2);assert.match(headers['X-Xtreme-Nonce'],/^[0-9a-f-]{36}$/);
 const hash=createHash('sha256').update(sent.init.body).digest('hex');
 assert.equal(headers['X-Xtreme-Signature'],mac(JSON.stringify(['xtreme-assistant-v1',APP,subject,'POST','/assistant/v1/calls',headers['X-Xtreme-Timestamp'],headers['X-Xtreme-Nonce'],hash])));
 assert.equal(headers.authorization,undefined);assert.equal(headers['oai-authenticated-user-id'],undefined);assert.equal(headers['OAI-Sites-Authorization'],undefined);
 assert.ok(!JSON.stringify(sent).includes(APP_SECRET));assert.ok(!JSON.stringify(sent).includes(SECRET));assert.ok(!JSON.stringify(sent).includes(owner.id));
 const [payload,signature]=prep.body.review_token.split('.');assert.equal(signature,createHmac('sha256',APP_SECRET).update(payload).digest('base64url'));
 assert.ok(!JSON.stringify(prep.body).includes(APP_SECRET));
});
test('dedicated capability wins over legacy binding and never downgrades after an invalid secret or transport failure',async()=>{
 const f=fixture({hmac:true});f.env.BRIDGE_TOKEN=SECRET;f.env.BRIDGE_URL='https://attacker.test';
 assert.equal((await f.request('readiness')).status,200);assert.equal(f.sent[0].url,SERVICE+'/assistant/v1/calls');
 for(const invalid of ['',null,23,'short','a'.repeat(48)+'\n']){f.env.XTREME_ASSISTANT_SECRET=invalid;assert.equal((await f.request('readiness')).body.code,'bridge_unlinked');}
 assert.equal(f.sent.length,1);f.env.XTREME_ASSISTANT_SECRET=APP_SECRET;f.breakTransport();
 assert.equal((await f.request('readiness')).body.code,'bridge_outcome_unknown');assert.equal(f.sent.length,2);assert.equal(f.sent[1].url,SERVICE+'/assistant/v1/calls');
});
test('dedicated capability still requires active owner, exact browser identity and same origin',async()=>{
 const f=fixture({hmac:true});
 for(const options of [{user:null},{user:admin},{headers:{origin:'https://attacker.test'}},{headers:{'x-xtreme-account':'other'}}])assert.ok((await f.request('readiness',{},null,options)).status>=400);
 assert.equal((await f.request('prepare',prepare,null,{extra:{owner:true}})).status,400);
 assert.equal((await f.request('prepare',{...prepare,owner:true})).status,400);assert.equal(f.sent.length,0);
 await f.request('prepare',prepare);f.sqlite.prepare("UPDATE members SET role='admin' WHERE user_id=?").run(owner.id);
 assert.equal((await f.request('readiness')).status,403);assert.equal(f.sent.length,1);
});
test('dedicated call start preserves exact reviewed recipient, purpose, consent, charges and durable unknown recovery',async()=>{
 const f=fixture({hmac:true}),prep=await f.request('prepare',prepare);
 for(const args of [start({confirm_to:'+15559999999'}),start({confirm_purpose:'Changed'}),start({recipient_consented:false}),start({approve_charges:false})])assert.ok((await f.request('start',args,prep.body.review_token)).status>=400);
 assert.equal(f.sent.length,1);
 let durable=false;f.beforeFetch(()=>{const row=JSON.parse(f.sqlite.prepare("SELECT value FROM private_state WHERE user_id=? AND key='call_review'").get(owner.id).value);assert.equal(row.pending,true);assert.equal(row.data.state,'submitting');durable=true;});f.breakTransport();
 const result=await f.request('start',start(),prep.body.review_token);assert.equal(result.body.code,'bridge_outcome_unknown');assert.equal(durable,true);
 assert.deepEqual(f.sent[1].rpc,{action:'start',args:start(),owner:true});
 assert.notEqual(f.sent[0].init.headers['X-Xtreme-Nonce'],f.sent[1].init.headers['X-Xtreme-Nonce']);
 const resumed=await f.request('resume');assert.equal(resumed.body.recovery_pending,true);assert.equal(resumed.body.data.state,'submitting');
 assert.equal((await f.request('start',start(),resumed.body.review_token)).body.code,'call_unresolved');assert.equal(f.sent.length,2);
});
test('dedicated conference keeps every reviewed human leg and excludes unrelated tool actions',async()=>{
 const f=fixture({hmac:true});f.setResponse(room);const prep=await f.request('conference_prepare',conferenceArgs);
 const args={conference_id:'room_1',step:2,confirm_to:room.steps[1].to,confirm_purpose:room.purpose,recipient_consented:true,approve_charges:true};
 assert.equal((await f.request('conference_dial_leg',{...args,confirm_to:room.steps[2].to},prep.body.review_token)).body.code,'review_mismatch');
 assert.equal((await f.request('conference_dial_leg',args,prep.body.review_token)).status,200);assert.deepEqual(f.sent[1].rpc,{action:'conference_dial_leg',args,owner:true});
 assert.equal((await f.request('tools/call',{name:'eden_admin'})).status,400);assert.equal((await f.request('batch_start',{})).status,400);assert.equal(f.sent.length,2);
});
test('dedicated service failures are sanitized and redirects or malformed receipts are never followed',async()=>{
 const f=fixture({hmac:true});f.setError('Missing: provider configuration secret '+APP_SECRET);
 let result=await f.request('prepare',prepare);assert.equal(result.body.code,'mode_unavailable');assert.ok(!JSON.stringify(result.body).includes(APP_SECRET));
 f.setError(null);f.setRawResponse({ok:false,reason:'invalid_auth',secret:APP_SECRET},403);
 result=await f.request('readiness');assert.equal(result.body.code,'bridge_outcome_unknown');assert.ok(!JSON.stringify(result.body).includes(APP_SECRET));
 f.setRawResponse({ok:true,data:receipt},302);assert.equal((await f.request('prepare',prepare)).body.code,'bridge_outcome_unknown');
 f.setRawResponse({ok:true,data:{...receipt,to:'+15559999999',secret:APP_SECRET}});assert.equal((await f.request('prepare',prepare)).body.code,'bridge_receipt_invalid');
 f.setRawResponse({ok:true,data:null});assert.equal((await f.request('prepare',prepare)).body.code,'bridge_receipt_invalid');
 assert.equal(f.sent.length,5);assert.ok(f.sent.every(s=>s.url===SERVICE+'/assistant/v1/calls'&&s.init.redirect==='manual'));
});
test('legacy saved review can be resumed under dedicated secret without extending expiry or accepting old signature',async()=>{
 const f=fixture(),prep=await f.request('prepare',prepare),old=JSON.parse(Buffer.from(prep.body.review_token.split('.')[0],'base64url'));
 f.env.XTREME_ASSISTANT_SECRET=APP_SECRET;delete f.env.BRIDGE_TOKEN;delete f.env.BRIDGE_URL;
 const resumed=await f.request('resume');assert.equal(resumed.status,200);assert.equal(f.sent.length,1);
 const [payload,signature]=resumed.body.review_token.split('.');assert.equal(signature,createHmac('sha256',APP_SECRET).update(payload).digest('base64url'));
 assert.equal(JSON.parse(Buffer.from(payload,'base64url')).expires,old.expires);
 assert.equal((await f.request('start',start(),prep.body.review_token)).body.code,'review_required');assert.equal(f.sent.length,1);
});


test('terminal receipts surface only known end reasons without exposing transcripts or raw events',async()=>{
 const f=fixture(),prep=await f.request('prepare',prepare);
 f.setResponse({...receipt,state:'completed',last_event:'media_stream_closed',events:[{code:'recipient_consent_timeout',transcript:'PRIVATE'},{code:'media_stream_closed'}]});
 const result=await f.request('status',{call_id:receipt.call_id},prep.body.review_token);
 assert.equal(result.body.data.end_reason,'recipient_consent_timeout');assert.equal(result.body.data.events,undefined);assert.ok(!JSON.stringify(result.body).includes('PRIVATE'));
 f.setResponse({...receipt,state:'in-progress',events:[{code:'recipient_consent_timeout'}]});
 assert.equal((await f.request('status',{call_id:receipt.call_id},prep.body.review_token)).body.data.end_reason,undefined);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {assistantServiceRequest,handleAssistant} from '../server/assistant.mjs';
import {createD1Adapter} from '../server/postgres-d1.mjs';
import {routeEdgeRequest} from '../server/edge-router.mjs';
import {storeAssistantActions} from '../server/assistant-action-receipts.mjs';

const ORIGIN='https://preview.example.test';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const ORG='8239c37e-9b5c-49bf-af9c-dd0dcd091047';
const user=id=>({id,email:id+'@test.invalid',email_confirmed_at:'2026-11-07T00:00:00Z',is_anonymous:false});
const env=id=>({MIGRATED_IDENTITY:true,CHAT_V2_ENABLED:true,AUTH_USER:user(id),ACCESS_TOKEN:'test-only-token',APP_ORIGIN:ORIGIN});
const payload=()=>({requestId:crypto.randomUUID(),messages:[{role:'user',content:'Test draft'}]});

test('chat v2 forwards only verified bearer and exact app origin to the fixed runtime',async()=>{
 let calls=0;
 const input=payload();
 const fetcher=async(url,init)=>{
  calls++;assert.equal(url,'https://eden-outbound-call-sandbox-code.up.railway.app/xtreme/v2/chat');
  assert.equal(init.method,'POST');assert.equal(init.redirect,'manual');
  assert.deepEqual(init.headers,{'content-type':'application/json',accept:'application/json',Authorization:'Bearer test-only-token',Origin:ORIGIN});
  assert.deepEqual(JSON.parse(init.body),input);
  assert.ok(!JSON.stringify(init).includes(user(A).email));
  return Response.json({ok:true,requestId:input.requestId,reply:'Draft'});
 };
 assert.equal((await assistantServiceRequest(env(A),A,'/assistant/v1/chat',input,fetcher)).reply,'Draft');
 for(const settings of [{CHAT_V2_ENABLED:false},{ACCESS_TOKEN:''},{AUTH_USER:user(B)},{APP_ORIGIN:'http://preview.example.test'},{APP_ORIGIN:'https://preview.example.test/extra'},{APP_ORIGIN:undefined}]){
  await assert.rejects(()=>assistantServiceRequest({...env(A),...settings},A,'/assistant/v1/chat',input,fetcher),e=>e.code==='service_unavailable');
 }
 await assert.rejects(()=>assistantServiceRequest(env(A),A,'https://evil.test/chat',input,fetcher),e=>e.status===404);
 assert.equal(calls,1);
});

test('chat v2 never infers a terminal result from auth, timeout, quota or transport errors',async()=>{
 for(const [code,status] of [['provider_timeout',502],['membership_or_session_required',403],['quota_exceeded',429],['provider_outcome_unknown',502]]){
  await assert.rejects(()=>assistantServiceRequest(env(A),A,'/assistant/v1/chat',payload(),async()=>Response.json({ok:false,code,terminal:false,error:'private upstream details'},{status})),e=>e.terminal===false&&!e.message.includes('private upstream'));
 }
 await assert.rejects(()=>assistantServiceRequest(env(A),A,'/assistant/v1/chat',payload(),async()=>Response.json({ok:false,code:'request_pending',terminal:false},{status:409})),e=>e.code==='request_pending'&&e.terminal===false);
 const bound=payload();
 await assert.rejects(()=>assistantServiceRequest(env(A),A,'/assistant/v1/chat',bound,async()=>Response.json({ok:false,code:'request_failed',terminal:true,requestId:bound.requestId},{status:502})),e=>e.code==='request_failed'&&e.terminal===true);
 for(const wrong of [undefined,crypto.randomUUID()])await assert.rejects(()=>assistantServiceRequest(env(A),A,'/assistant/v1/chat',bound,async()=>Response.json({ok:false,code:'request_failed',terminal:true,requestId:wrong},{status:502})),e=>e.code==='outcome_unknown'&&e.terminal===false);
 await assert.rejects(()=>assistantServiceRequest(env(A),A,'/assistant/v1/chat',payload(),async()=>{throw Error('private network details');}),e=>e.code==='outcome_unknown'&&!e.message.includes('private network'));
});

test('chat response limits reject oversized, invalid UTF-8, malformed and redirected responses',async()=>{
 for(const response of [new Response('x'.repeat(65537)),new Response(new Uint8Array([255])),new Response('{invalid'),new Response(null,{status:302,headers:{location:'https://evil.test'}})]){
  await assert.rejects(()=>assistantServiceRequest(env(A),A,'/assistant/v1/chat',payload(),async()=>response),e=>['outcome_unknown','service_unavailable'].includes(e.code));
 }
});

test('migrated chat persists and isolates real PostgreSQL history with safe replay',async t=>{
 const pg=new PGlite();
 try{
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
  await pg.exec(await readFile(new URL('../supabase/migrations/202611070001_xtreme_avatar.sql',import.meta.url),'utf8'));
  for(const id of [A,B]){
   await pg.query('INSERT INTO auth.users VALUES($1,$2,now(),false)',[id,user(id).email]);
   await pg.query("INSERT INTO xtreme_avatar.members VALUES($1,$2,$3,'member','active',now()::text)",[id,ORG,user(id).email]);
  }
  const client={begin:fn=>pg.transaction(async tx=>fn({unsafe:async(sql,args=[])=>{const r=await tx.query(sql,args);return Object.assign(r.rows,{count:r.affectedRows??r.rows.length});}}))};
  const dbs=new Map([A,B].map(id=>[id,createD1Adapter(client,user(id))]));
  const calls=[];
  let responder=async(_url,init)=>Response.json({ok:true,requestId:JSON.parse(init.body).requestId,reply:'Private reply'});
  const fetcher=async(url,init)=>{calls.push({url,init});return responder(url,init);};
  async function request(id,input,extra={}){
   const req=new Request(ORIGIN+'/api/assistant/chat',{method:input?'POST':'GET',headers:{origin:ORIGIN,'content-type':'application/json','x-xtreme-account':id,...extra},body:input?JSON.stringify(input):undefined});
   const r=await handleAssistant(req,{...env(id),DB:dbs.get(id)},fetcher);return {status:r.status,body:await r.json()};
  }
  const message=text=>({requestId:crypto.randomUUID(),message:text});
  await t.test('completed retry is cached and another account cannot read or inject its history',async()=>{
   const input=message('ALICE PRIVATE');
   assert.equal((await request(A,input)).status,200);
   assert.equal((await request(A,input)).status,200);assert.equal(calls.length,1);
   assert.deepEqual((await request(B)).body.messages,[]);
   assert.equal((await request(A,{...input,message:'changed'})).body.code,'request_conflict');
   assert.equal((await request(B,message('BOB PRIVATE'))).status,200);
   assert.ok(!calls.at(-1).init.body.includes('ALICE PRIVATE'));
   assert.equal((await request(B,undefined,{'x-xtreme-account':A})).status,409);
   const rows=await dbs.get(B).prepare('SELECT * FROM assistant_turns WHERE user_id=?').bind(A).all();assert.equal(rows.results.length,0);
  });
  await t.test('unknown result freezes original persona and message until exact recovery',async()=>{
   await dbs.get(A).prepare('INSERT INTO private_state(user_id,key,value,version,updated_at) VALUES(?,?,?,1,?)').bind(A,'model','"maya"','now').run();
   const input=message('Keep this draft');responder=async()=>Response.json({ok:false,code:'provider_timeout',terminal:false},{status:502});
   assert.equal((await request(A,input)).body.code,'outcome_unknown');
   assert.deepEqual((await request(A)).body.pendingRequest,input);
   const original=calls.at(-1).init.body;
   assert.match(JSON.parse(original).messages[0].content,/Assistant persona: Maya/);
   await dbs.get(A).prepare('UPDATE private_state SET value=?,version=version+1 WHERE user_id=? AND key=?').bind('"atlas"',A,'model').run();
   assert.equal((await request(A,message('different request'))).body.code,'request_pending');
   responder=async(_url,init)=>Response.json({ok:true,requestId:JSON.parse(init.body).requestId,reply:'Recovered'});
   assert.equal((await request(A,input)).body.reply,'Recovered');assert.equal(calls.at(-1).init.body,original);
   assert.equal((await request(A)).body.pending,false);
  });
  await t.test('proven terminal result unlocks a new message without resending the failed request',async()=>{
   const input=message('Failure test');responder=async()=>Response.json({ok:false,code:'provider_unavailable',terminal:true,requestId:input.requestId},{status:502});
   assert.equal((await request(A,input)).body.terminal,true);
   const count=calls.length;assert.equal((await request(A,input)).body.terminal,true);assert.equal(calls.length,count);
   assert.equal((await request(A)).body.pending,false);
  });

  await t.test('confirmed task receipts are private, replayed without another inference, and absent from model history',async()=>{
   const input=message('Save my private follow-up task'),action={id:crypto.randomUUID(),kind:'saved',resource:'task',itemId:'task_private_a',title:'ALICE PRIVATE TASK'};
   responder=async(_url,init)=>Response.json({ok:true,requestId:JSON.parse(init.body).requestId,reply:'Task saved.',actions:[action]});
   const first=await request(A,input);assert.equal(first.status,200);assert.deepEqual(first.body.actions,[action]);
   const count=calls.length;assert.deepEqual((await request(A,input)).body.actions,[action]);assert.equal(calls.length,count);
   assert.ok(!(JSON.stringify((await request(B)).body).includes('ALICE PRIVATE TASK')));
   const next=message('What was saved?');responder=async(_url,init)=>Response.json({ok:true,requestId:JSON.parse(init.body).requestId,reply:'Your task is in Tasks.'});
   assert.equal((await request(A,next)).status,200);assert.ok(!calls.at(-1).init.body.includes('task_private_a'));
  });
  await t.test('expired genuine review completes chat and immutable replay survives expiry without repeating inference',async()=>{
   const rid=crypto.randomUUID(),now=Date.now(),action={id:rid,kind:'calendar_review',connectionRevision:2,review:{state:'review',requestId:rid,reviewToken:'a'.repeat(43),expiresAt:new Date(now-1000).toISOString(),action:'create',eventId:null,eventRef:null,draft:{title:'Private job walk',notes:'',location:'',start:'2026-12-01T12:00:00.000Z',end:'2026-12-01T13:00:00.000Z',allDay:false,timeZone:'UTC'},defaults:{visibility:'private',notifications:false,reminders:false}}};
   const input=message('Prepare a job walk');responder=async()=>Response.json({ok:true,requestId:input.requestId,reply:'A job walk was prepared for review.',actions:[action]});
   const first=await request(A,input);assert.equal(first.status,200);assert.equal(first.body.actions,undefined);assert.equal((await request(A)).body.pending,false);
   const count=calls.length;assert.equal((await request(A,input)).status,200);assert.equal(calls.length,count);
   const pendingRid=crypto.randomUUID(),future=structuredClone(action);future.review.expiresAt=new Date(now+60000).toISOString();
   assert.equal((await storeAssistantActions(dbs.get(A),A,pendingRid,[future],{now})).length,1);
   assert.deepEqual(await storeAssistantActions(dbs.get(A),A,pendingRid,[future],{now:now+61000}),[]);
   assert.deepEqual(await storeAssistantActions(dbs.get(A),A,pendingRid,[]),[]);
   const row=await dbs.get(A).prepare('SELECT value FROM private_state WHERE user_id=? AND key=?').bind(A,'assistant_actions_v1:'+pendingRid).first();
   assert.equal(JSON.parse(row.value).actions[0].review.reviewToken,'a'.repeat(43));
   assert.equal((await dbs.get(B).prepare('SELECT value FROM private_state WHERE user_id=? AND key=?').bind(A,'assistant_actions_v1:'+pendingRid).first()),null);
  });
  await t.test('invalid executable receipt preserves pending identity until verified recovery',async()=>{
   const input=message('Open Calendar');
   responder=async()=>Response.json({ok:true,requestId:input.requestId,reply:'Opening Calendar.',actions:[{id:crypto.randomUUID(),kind:'navigate',screen:'https://evil.test'}]});
   assert.equal((await request(A,input)).body.code,'outcome_unknown');assert.deepEqual((await request(A)).body.pendingRequest,input);
   const action={id:crypto.randomUUID(),kind:'navigate',screen:'calendar'};
   responder=async()=>Response.json({ok:true,requestId:input.requestId,reply:'Opening Calendar.',actions:[action]});
   const recovered=await request(A,input);assert.equal(recovered.status,200);assert.deepEqual(recovered.body.actions,[action]);assert.equal((await request(A)).body.pending,false);
  });

  await t.test('runtime chat, voice and Google Workspace entitlements are independent and require active membership',async()=>{
   for(const [chatEnabled,voiceEnabled] of [[false,true],[true,false],[false,false]]){
    const req=new Request('https://backend.test/xtreme-avatar-api/api/runtime-session',{headers:{origin:ORIGIN,authorization:'Bearer test-only-token'}});
    const response=await routeEdgeRequest(req,{allowedOrigins:ORIGIN,verifyUser:async()=>user(A),databaseFor:()=>dbs.get(A),chatEnabled,voiceEnabled});
    assert.equal(response.status,200);const data=await response.json();
    assert.deepEqual(data.entitlements,{browser_voice:voiceEnabled,assistant_chat:chatEnabled,google_workspace:true});assert.equal(data.user.id,A);
   }
   await pg.query("UPDATE xtreme_avatar.members SET status='suspended' WHERE user_id=$1",[A]);
   const req=new Request('https://backend.test/xtreme-avatar-api/api/runtime-session',{headers:{origin:ORIGIN,authorization:'Bearer test-only-token'}});
   const response=await routeEdgeRequest(req,{allowedOrigins:ORIGIN,verifyUser:async()=>user(A),databaseFor:()=>dbs.get(A),chatEnabled:true,voiceEnabled:true});assert.equal(response.status,403);
   const count=calls.length;assert.equal((await request(A,message('blocked'))).status,403);assert.equal(calls.length,count);
   assert.equal((await request(A)).status,403);
  });
 }finally{await pg.close();}
});
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleAccounts } from '../server/accounts.mjs';
import { AVATARS, DEFAULT_PREFERENCES } from '../public/assistant-catalog.mjs';
import { DEFAULT_ASSISTANT_CONTROLS } from '../server/assistant-controls.mjs';

const ORIGIN='https://xtreme.example.test';
const owner={id:'owner-id',email:'owner@example.test'};
const boss={id:'boss-id',email:'boss@example.test'};
const alice={id:'alice-id',email:'alice@example.test'};
const bob={id:'bob-id',email:'bob@example.test'};
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../drizzle/0000_unknown_blazing_skull.sql',import.meta.url),'utf8'));
 let beforeRun=null;
 function statement(sql,args=[]){return {
  bind(...next){return statement(sql,next);},
  async first(){return sqlite.prepare(sql).get(...args)??null;},
  async all(){return {results:sqlite.prepare(sql).all(...args)};},
  async run(){if(beforeRun)beforeRun(sql,args);const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}
 };}
 const env={DB:{prepare:statement},XTREME_OWNER_EMAIL:owner.email,XTREME_ADMIN_EMAIL:boss.email};
 async function request(identity,path='/api/account',input,extra={}){
  const headers={...(identity?{'oai-authenticated-user-id':identity.id,'oai-authenticated-user-email':identity.email}:{}),...(input===undefined?{}:{origin:ORIGIN,'content-type':'application/json','x-xtreme-account':identity?.id||''}),...extra};
  const response=await handleAccounts(new Request(ORIGIN+path,{method:input===undefined?'GET':'POST',headers,body:input===undefined?undefined:JSON.stringify(input)}),env);
  return {status:response.status,headers:response.headers,body:await response.json()};
 }
 async function invite(identity,role='member'){await request(owner);const result=await request(owner,'/api/team',{action:'invite',email:identity.email,role});assert.equal(result.status,200);return request(identity);}
 return {sqlite,env,request,invite,setBeforeRun(fn){beforeRun=fn;}};
}
const draft=body=>({to:'+15551234567',body,channel:'SMS'});
const write=(f,user,value,version=0,extra={})=>f.request(user,'/api/account/state',{key:'draft',value:draft(value),version,...extra});

test('anonymous and service-only access cannot read private records',async()=>{
 const f=fixture();assert.equal((await f.request(null)).status,401);
 assert.equal((await f.request(null,'/api/account',undefined,{'OAI-Sites-Authorization':'Bearer service-only'})).status,401);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM members').get().n,0);
});
test('verified owner and boss bootstrap once; unknown users are denied',async()=>{
 const f=fixture();assert.equal((await f.request(owner)).body.user.role,'owner');
 assert.equal((await f.request(boss)).body.user.role,'admin');
 assert.equal((await f.request(alice)).status,403);
 assert.equal((await f.request(owner)).body.user.id,owner.id);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM members').get().n,2);
});
test('account records are isolated and forged ownership is rejected',async()=>{
 const f=fixture();await f.invite(alice);await f.invite(bob);
 assert.equal((await write(f,alice,'ALICE PRIVATE')).status,200);
 assert.equal((await write(f,bob,'BOB PRIVATE')).status,200);
 assert.equal((await f.request(alice,'/api/account?user_id='+bob.id)).body.data.draft.body,'ALICE PRIVATE');
 assert.equal((await f.request(bob)).body.data.draft.body,'BOB PRIVATE');
 assert.equal((await write(f,alice,'overwrite',1,{user_id:bob.id})).status,400);
 assert.equal((await f.request(owner)).body.data.draft,undefined);
});
test('stale edits cannot overwrite later edits',async()=>{
 const f=fixture();await f.invite(alice);
 assert.equal((await write(f,alice,'first')).body.version,1);
 assert.equal((await write(f,alice,'duplicate')).status,409);
 assert.equal((await write(f,alice,'second',1)).body.version,2);
 assert.equal((await write(f,alice,'stale',1)).status,409);
 assert.equal((await f.request(alice)).body.data.draft.body,'second');
});
test('old tab cannot save into a switched account',async()=>{
 const f=fixture();await f.invite(alice);await f.invite(bob);
 const result=await f.request(bob,'/api/account/state',{key:'draft',value:draft('Alice old-tab data'),version:0},{'x-xtreme-account':alice.id});
 assert.equal(result.status,409);assert.equal(result.body.code,'account_changed');
 assert.equal((await f.request(bob)).body.data.draft,undefined);
});
test('cross-origin, malformed, and oversized writes are denied',async()=>{
 const f=fixture();await f.request(owner);const input={key:'draft',value:draft('test'),version:0};
 assert.equal((await f.request(owner,'/api/account/state',input,{origin:'https://other.example.test'})).status,403);
 assert.equal((await f.request(owner,'/api/account/state',input,{'content-type':'text/plain'})).status,415);
 assert.equal((await f.request(owner,'/api/account/state',{...input,version:-1})).status,400);
 assert.equal((await f.request(owner,'/api/account/state',{...input,value:draft('a'.repeat(3001))})).status,400);
 const headers={origin:ORIGIN,'content-type':'application/json','oai-authenticated-user-id':owner.id,'oai-authenticated-user-email':owner.email,'x-xtreme-account':owner.id};
 const malformed=await handleAccounts(new Request(ORIGIN+'/api/account/state',{method:'POST',headers,body:'{bad json'}),f.env);assert.equal(malformed.status,400);
 const large=await handleAccounts(new Request(ORIGIN+'/api/account/state',{method:'POST',headers,body:JSON.stringify({x:'x'.repeat(131073)})}),f.env);assert.equal(large.status,413);
});
test('members cannot administer and admins cannot escalate or change owner',async()=>{
 const f=fixture();await f.request(owner);await f.request(boss);await f.invite(alice);
 assert.equal((await f.request(alice,'/api/team')).status,403);
 assert.equal((await f.request(boss,'/api/team',{action:'invite',email:bob.email,role:'admin'})).status,400);
 assert.equal((await f.request(boss,'/api/team',{action:'update',id:owner.id,role:'member',status:'suspended'})).status,403);
 assert.equal((await f.request(boss,'/api/team',{action:'update',id:boss.id,role:'owner',status:'active'})).status,403);
 assert.equal((await f.request(owner,'/api/team',{action:'update',id:alice.id,role:'admin',status:'active'})).status,200);
 assert.equal((await f.request(boss,'/api/team',{action:'update',id:alice.id,role:'member',status:'suspended'})).status,403);
 assert.equal((await f.request(owner,'/api/team',{action:'update',id:owner.id,role:'member',status:'active'})).status,403);
});
test('suspension denies subsequent reads and writes, including bootstrap admin',async()=>{
 const f=fixture();await f.request(owner);await f.request(boss);await f.invite(alice);
 for(const user of [alice,boss]){
  const role=user===boss?'admin':'member';assert.equal((await f.request(owner,'/api/team',{action:'update',id:user.id,role,status:'suspended'})).status,200);
  assert.equal((await f.request(user)).status,403);assert.equal((await write(f,user,'denied')).status,403);
  assert.equal(f.sqlite.prepare('SELECT status FROM members WHERE user_id=?').get(user.id).status,'suspended');
 }
});
test('revoked invitation cannot sign in; claimed email cannot bind another ID',async()=>{
 const f=fixture();await f.request(owner);
 assert.equal((await f.request(owner,'/api/team',{action:'invite',email:alice.email,role:'member'})).status,200);
 assert.equal((await f.request(owner,'/api/team',{action:'revoke_invite',email:alice.email})).status,200);
 assert.equal((await f.request(alice)).status,403);
 await f.invite(bob);assert.equal((await f.request({id:'impostor-id',email:bob.email})).status,403);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM members WHERE email=?').get(bob.email).n,1);
});
test('responses are never shared-cacheable and team roster contains no private state',async()=>{
 const f=fixture();await f.invite(alice);await write(f,alice,'SENSITIVE_PRIVATE_VALUE');
 const account=await f.request(alice);assert.equal(account.headers.get('cache-control'),'private, no-store');
 const roster=await f.request(owner,'/api/team');assert.equal(roster.headers.get('cache-control'),'private, no-store');
 assert.ok(!JSON.stringify(roster.body).includes('SENSITIVE_PRIVATE_VALUE'));
 assert.equal(roster.body.members.find(m=>m.id===alice.id).role,'member');
});
test('invitation revocation immediately before atomic claim prevents membership',async()=>{
 const f=fixture();await f.request(owner);await f.request(owner,'/api/team',{action:'invite',email:alice.email,role:'member'});
 f.setBeforeRun(sql=>{if(sql.startsWith('INSERT OR IGNORE INTO members')){f.setBeforeRun(null);f.sqlite.prepare("UPDATE invitations SET status='revoked' WHERE email=?").run(alice.email);}});
 assert.equal((await f.request(alice)).status,403);
 assert.equal(f.sqlite.prepare('SELECT user_id FROM members WHERE user_id=?').get(alice.id),undefined);
});
test('concurrent target promotion prevents an admin from changing that administrator',async()=>{
 const f=fixture();await f.request(owner);await f.request(boss);await f.invite(alice);
 f.setBeforeRun(sql=>{if(sql.startsWith('UPDATE members SET role=')){f.setBeforeRun(null);f.sqlite.prepare("UPDATE members SET role='admin' WHERE user_id=?").run(alice.id);}});
 const result=await f.request(boss,'/api/team',{action:'update',id:alice.id,role:'member',status:'suspended'});
 assert.equal(result.status,403);const row=f.sqlite.prepare('SELECT role,status FROM members WHERE user_id=?').get(alice.id);
 assert.equal(row.role,'admin');assert.equal(row.status,'active');
});
test('actor suspension between authorization and roster mutation blocks every team write',async()=>{
 for(const action of ['invite','update','revoke_invite']){
  const f=fixture();await f.request(owner);await f.request(boss);await f.invite(alice);
  await f.request(owner,'/api/team',{action:'invite',email:bob.email,role:'member'});
  const prefix=action==='invite'?'INSERT INTO invitations':action==='update'?'UPDATE members SET role=':'UPDATE invitations SET status=';
  f.setBeforeRun(sql=>{if(sql.startsWith(prefix)){f.setBeforeRun(null);f.sqlite.prepare("UPDATE members SET status='suspended' WHERE user_id=?").run(boss.id);}});
  const input=action==='invite'?{action,email:'new@example.test',role:'member'}:action==='update'?{action,id:alice.id,role:'member',status:'suspended'}:{action,email:bob.email};
  assert.equal((await f.request(boss,'/api/team',input)).status,403,action);
  assert.equal(f.sqlite.prepare('SELECT status FROM members WHERE user_id=?').get(alice.id).status,'active');
  assert.equal(f.sqlite.prepare('SELECT status FROM invitations WHERE email=?').get(bob.email).status,'active');
  assert.equal(f.sqlite.prepare('SELECT email FROM invitations WHERE email=?').get('new@example.test'),undefined);
 }
});


test('assistant chat drafts use their own private key and never overwrite SMS, tasks, or transcript',async()=>{
 const f=fixture();await f.invite(alice);await f.invite(bob);
 await write(f,alice,'Existing SMS');
 assert.equal((await f.request(alice,'/api/account/state',{key:'transcript',value:'Private transcript',version:0})).status,200);
 assert.equal((await f.request(alice,'/api/account/state',{key:'assistant_chat_draft',value:'Alice assistant draft',version:0})).status,200);
 assert.equal((await f.request(bob,'/api/account/state',{key:'assistant_chat_draft',value:'Bob assistant draft',version:0})).status,200);
 const data=(await f.request(alice,'/api/account?user_id='+bob.id)).body.data;
 assert.equal(data.assistant_chat_draft,'Alice assistant draft');assert.equal(data.draft.body,'Existing SMS');assert.equal(data.transcript,'Private transcript');
 assert.equal((await f.request(bob)).body.data.assistant_chat_draft,'Bob assistant draft');
 assert.equal((await f.request(owner)).body.data.assistant_chat_draft,undefined);
 const roster=await f.request(owner,'/api/team');assert.ok(!JSON.stringify(roster.body).includes('assistant draft'));
});

test('assistant chat draft bounds, stale versions, and switched-account writes are enforced server-side',async()=>{
 const f=fixture();await f.invite(alice);await f.invite(bob);
 const chat=(identity,value,version=0,headers={})=>f.request(identity,'/api/account/state',{key:'assistant_chat_draft',value,version},headers);
 for(const value of [null,{},[],12,'x'.repeat(4001)])assert.equal((await chat(alice,value)).status,400);
 assert.equal((await chat(alice,'x'.repeat(4000))).body.version,1);
 assert.equal((await chat(alice,'Stale',0)).status,409);
 assert.equal((await chat(bob,'Alice old tab',0,{'x-xtreme-account':alice.id})).body.code,'account_changed');
 assert.equal((await chat(alice,'Cross origin',1,{origin:'https://other.test'})).status,403);
 assert.equal((await chat(alice,'',1)).body.version,2);
 assert.equal((await f.request(alice)).body.data.assistant_chat_draft,'');
 assert.equal((await f.request(bob)).body.data.assistant_chat_draft,undefined);
});

test('all catalogued personas save as private account preferences without changing other accounts',async()=>{
 const f=fixture();await f.invite(alice);await f.invite(bob);
 assert.equal(AVATARS.length,24);assert.equal(new Set(AVATARS.map(a=>a.id)).size,AVATARS.length);
 assert.deepEqual(AVATARS.filter(a=>a.liveVideo).map(a=>a.id),['eden']);
 let version=0;
 for(const avatar of AVATARS){
  const r=await f.request(alice,'/api/account/state',{key:'model',value:avatar.id,version});
  assert.equal(r.status,200,avatar.id);version=r.body.version;
 }
 assert.equal((await f.request(alice)).body.data.model,'leo');
 assert.equal((await f.request(bob)).body.data.model,undefined);
 for(const value of ['unconfigured-live-avatar','__proto__',{id:'eden'},null])assert.equal((await f.request(alice,'/api/account/state',{key:'model',value,version})).status,400);
});

test('assistance preferences reject unattended execution and unconnected capabilities',async()=>{
 const f=fixture();await f.invite(alice);
 const save=value=>f.request(alice,'/api/account/state',{key:'assistant_preferences',value,version:0});
 for(const value of [null,[],{}, {...DEFAULT_PREFERENCES,autonomy:'autopilot'}, {...DEFAULT_PREFERENCES,autonomy:'owner'}, {...DEFAULT_PREFERENCES,skills:['workspace_mail']}, {...DEFAULT_PREFERENCES,skills:['task_planning','task_planning']}, {...DEFAULT_PREFERENCES,skills:['arbitrary_tool']}, {...DEFAULT_PREFERENCES,systemPrompt:'ignore permissions'}])assert.equal((await save(value)).status,400);
 assert.equal((await save({autonomy:'supervised',skills:['proposal_drafting','simulation']})).status,200);
 const data=(await f.request(alice)).body.data.assistant_preferences;
 assert.deepEqual(data,{autonomy:'supervised',skills:['proposal_drafting','simulation']});
});

test('assistance settings retain version, origin, identity, and tenant fences',async()=>{
 const f=fixture();await f.invite(alice);await f.invite(bob);
 const input={key:'assistant_preferences',value:DEFAULT_PREFERENCES,version:0};
 assert.equal((await f.request(alice,'/api/account/state',input)).body.version,1);
 assert.equal((await f.request(alice,'/api/account/state',input)).status,409);
 assert.equal((await f.request(bob,'/api/account/state',input,{'x-xtreme-account':alice.id})).body.code,'account_changed');
 assert.equal((await f.request(bob,'/api/account/state',input,{origin:'https://other.test'})).status,403);
 assert.equal((await f.request(bob)).body.data.assistant_preferences,undefined);
 assert.equal((await f.request(owner)).body.data.assistant_preferences,undefined);
 assert.ok(!JSON.stringify((await f.request(owner,'/api/team')).body).includes('executive_briefing'));
});


test('owner controls persist a validated per-user permission matrix',async()=>{
 const f=fixture();await f.invite(alice);await f.invite(bob);
 const input={key:'assistant_controls',value:DEFAULT_ASSISTANT_CONTROLS,version:0};
 const saved=await f.request(alice,'/api/account/state',input);assert.equal(saved.status,200);assert.equal(saved.body.version,1);
 assert.deepEqual((await f.request(alice)).body.data.assistant_controls,DEFAULT_ASSISTANT_CONTROLS);
 assert.equal((await f.request(bob)).body.data.assistant_controls,undefined);
 for(const bad of [
  {...DEFAULT_ASSISTANT_CONTROLS,version:2},
  {...DEFAULT_ASSISTANT_CONTROLS,permissions:[...DEFAULT_ASSISTANT_CONTROLS.permissions,'arbitrary.root']},
  {...DEFAULT_ASSISTANT_CONTROLS,approvals:['send_email','send_email']},
  {...DEFAULT_ASSISTANT_CONTROLS,automation:{...DEFAULT_ASSISTANT_CONTROLS.automation,parallelLimit:21}},
  {...DEFAULT_ASSISTANT_CONTROLS,modules:{...DEFAULT_ASSISTANT_CONTROLS.modules,secretAdmin:true}}
 ])assert.equal((await f.request(bob,'/api/account/state',{key:'assistant_controls',value:bad,version:0})).status,400);
});

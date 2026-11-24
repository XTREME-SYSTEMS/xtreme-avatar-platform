import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createD1Adapter,translateSql} from '../server/postgres-d1.mjs';
import {routeEdgeRequest} from '../server/edge-router.mjs';
import {requireMember,handleAccounts} from '../server/accounts.mjs';
import {voiceServiceRequest,handleAssistantVoice} from '../server/assistant-voice.mjs';
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',W='33333333-3333-4333-8333-333333333333',O='44444444-4444-4444-8444-444444444444';
const ORG='8239c37e-9b5c-49bf-af9c-dd0dcd091047',OTHER='55555555-5555-4555-8555-555555555555';
const origin='https://preview.example.test';
const user=id=>({id,email:id+'@test.invalid',email_confirmed_at:'2026-11-07T00:00:00Z',is_anonymous:false});

test('SQL binding preserves quoted text and disallows non-reviewed statements',()=>{
 assert.equal(translateSql("SELECT '?' AS literal, ? AS value",['x']).sql,"SELECT '?' AS literal, $1 AS value");
 assert.equal(translateSql('INSERT OR IGNORE INTO private_state(key) VALUES(?)',['x']).sql,'INSERT INTO private_state(key) VALUES($1) ON CONFLICT DO NOTHING');
 assert.throws(()=>translateSql('SELECT ?',[1,2]));
 assert.throws(()=>translateSql('SELECT 1; DELETE FROM members'));
 assert.throws(()=>translateSql('CREATE TABLE bad(x text)'));
 assert.throws(()=>translateSql('SELECT 1 -- comment'));
});
test('each operation creates own transaction and establishes transaction-local identity',async()=>{
 const log=[];const client={async begin(fn){log.push('BEGIN');try{const r=await fn({unsafe:async(s,a)=>{log.push([s,a]);return Object.assign([{value:1}],{count:1});}});log.push('COMMIT');return r;}catch(e){log.push('ROLLBACK');throw e;}}};
 const db=createD1Adapter(client,user(U));
 assert.equal((await db.prepare('SELECT ? AS value').bind(1).first()).value,1);
 assert.equal((await db.prepare('UPDATE private_state SET version=? WHERE user_id=?').bind(2,U).run()).meta.changes,1);
 assert.equal(log.filter(x=>x==='BEGIN').length,2);
 assert.equal(log.filter(x=>x==='COMMIT').length,2);
 assert.equal(log[1][0],'SET LOCAL ROLE authenticated');
 assert.equal(JSON.parse(log[2][1][0]).sub,U);
 assert.equal(log[3][0],'SET LOCAL search_path TO xtreme_avatar, pg_catalog');
});
test('identity spoofed in oai headers cannot authorize an account',async()=>{
 const req=new Request(origin+'/api/account',{headers:{'oai-authenticated-user-id':U,'oai-authenticated-user-email':user(U).email}});
 await assert.rejects(()=>requireMember(req,{DB:{}}),e=>e.status===401);
});
test('Edge validates token independently and only exact approved origins/routes',async()=>{
 let calls=0;
 const deps={allowedOrigins:origin,verifyUser:async()=>{calls++;return null;},databaseFor:()=>{throw Error('not reached');}};
 const req=(url,headers)=>new Request(url,{headers:{origin,...headers}});
 assert.equal((await routeEdgeRequest(req('https://backend.test/functions/v1/xtreme-avatar-api/api/account',{'oai-authenticated-user-id':U}),deps)).status,401);
 assert.equal(calls,0);
 assert.equal((await routeEdgeRequest(req('https://backend.test/functions/v1/xtreme-avatar-api/api/account',{authorization:'Bearer forged'}),deps)).status,401);
 assert.equal(calls,1);
 assert.equal((await routeEdgeRequest(req('https://backend.test/functions/v1/xtreme-avatar-api/api/account',{origin:'https://preview.example.test.evil'}),deps)).status,403);
 assert.equal((await routeEdgeRequest(req('https://backend.test/functions/v1/xtreme-avatar-api/http://evil.test',{authorization:'Bearer forged'}),deps)).status,404);
});
test('migrated voice forwards verified token only to fixed Railway endpoint',async()=>{
 let observed;
 const env={AUTH_USER:user(U),ACCESS_TOKEN:'test-only-bearer',APP_ORIGIN:origin,MIGRATED_IDENTITY:true,VOICE_V2_ENABLED:true};
 const result=await voiceServiceRequest(env,U,'status',{},async(url,opts)=>{observed={url,opts};return Response.json({ready:false});});
 assert.equal(observed.url,'https://eden-outbound-call-sandbox-code.up.railway.app/xtreme/v2/voice/status');
 assert.equal(observed.opts.headers.Authorization,'Bearer test-only-bearer');
 assert.equal(observed.opts.headers.Origin,origin);
 assert.equal(Object.keys(observed.opts.headers).some(k=>k.startsWith('X-Xtreme')),false);
 assert.equal(result.data.ready,false);
 await assert.rejects(()=>voiceServiceRequest({...env,VOICE_V2_ENABLED:false},U,'start',{}),e=>e.code==='runtime_not_ready');
 await assert.rejects(()=>voiceServiceRequest(env,V,'status',{}),e=>e.code==='account_changed');
});

test('isolated real PostgreSQL migration, RLS, admission, durable CAS and rollback',async t=>{
 // Isolated developer-only database. No connection to a production project.
 const module=await import(process.env.XTREME_PGLITE_MODULE||'@electric-sql/pglite');
 const pg=new module.PGlite();
 await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
 await pg.exec(await readFile(new URL('../supabase/migrations/202611070001_xtreme_avatar.sql',import.meta.url),'utf8'));
 for(const id of [U,V,W,O])await pg.query('INSERT INTO auth.users VALUES($1,$2,now(),false)',[id,user(id).email]);
 await pg.query("INSERT INTO xtreme_avatar.organizations VALUES($1,'Other',now())",[OTHER]);
 await pg.query("INSERT INTO xtreme_avatar.members VALUES($1,$2,$3,'owner','active',now()::text),($4,$5,$6,'owner','active',now()::text),($7,$2,$8,'member','active',now()::text)",[U,ORG,user(U).email,V,OTHER,user(V).email,W,user(W).email]);
 const client={begin:fn=>pg.transaction(async tx=>fn({unsafe:async(sql,args=[])=>{const r=await tx.query(sql,args);return Object.assign(r.rows,{count:r.affectedRows??r.rows.length});}}))};
 const a=createD1Adapter(client,user(U)),b=createD1Adapter(client,user(V)),c=createD1Adapter(client,user(W)),outsider=createD1Adapter(client,user(O));
 await t.test('owner cannot read another org; member cannot read other members',async()=>{
  assert.equal(await a.prepare('SELECT * FROM members WHERE user_id=?').bind(V).first(),null);
  assert.equal(await c.prepare('SELECT * FROM members WHERE user_id=?').bind(U).first(),null);
  assert.equal((await a.prepare('SELECT * FROM members').all()).results.length,2);
 });
 await t.test('private state insert and compare-and-swap, with cross-user denial',async()=>{
  const insert="INSERT OR IGNORE INTO private_state(user_id,key,value,version,updated_at) SELECT ?,?,?,1,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')";
  assert.equal((await a.prepare(insert).bind(U,'profile','{"name":"Owner"}','now',U).run()).meta.changes,1);
  assert.equal((await a.prepare(insert).bind(U,'profile','{}','now',U).run()).meta.changes,0);
  assert.equal(await b.prepare('SELECT * FROM private_state WHERE user_id=?').bind(U).first(),null);
  assert.equal(await c.prepare('SELECT * FROM private_state WHERE user_id=?').bind(U).first(),null);
  await assert.rejects(()=>b.prepare('INSERT INTO private_state(user_id,key,value,version,updated_at) VALUES(?,?,?,?,?)').bind(U,'evil','{}',1,'now').run(),/row-level security/);
  const update='UPDATE private_state SET value=?,version=version+1 WHERE user_id=? AND key=? AND version=?';
  assert.equal((await a.prepare(update).bind('{"name":"Saved"}',U,'profile',1).run()).meta.changes,1);
  assert.equal((await a.prepare(update).bind('{"name":"Stale"}',U,'profile',1).run()).meta.changes,0);
  assert.equal((await b.prepare(update).bind('evil',U,'profile',2).run()).meta.changes,0);
 });
 await t.test('admission uses auth.users email and live invitation, never supplied claims',async()=>{
  const forged=createD1Adapter(client,{...user(O),email:user(U).email});
  await forged.admitVerifiedMember();
  assert.equal(await forged.prepare('SELECT * FROM members WHERE user_id=?').bind(O).first(),null);
  await a.prepare("INSERT INTO invitations(email,role,status,created_at) VALUES(?,'member','active',?)").bind(user(O).email,'now').run();
  await forged.admitVerifiedMember();
  const member=await outsider.prepare('SELECT * FROM members WHERE user_id=?').bind(O).first();
  assert.equal(member.role,'member');assert.equal(member.email,user(O).email);assert.equal(member.organization_id,ORG);
  assert.equal((await pg.query('SELECT status FROM xtreme_avatar.invitations WHERE email=$1',[user(O).email])).rows[0].status,'accepted');
  await a.prepare("UPDATE members SET status='suspended' WHERE user_id=?").bind(O).run();
  await outsider.admitVerifiedMember();
  assert.equal((await outsider.prepare('SELECT * FROM members WHERE user_id=?').bind(O).first()).status,'suspended');
 });
 await t.test('role escalation and identity movement are blocked',async()=>{
  assert.equal((await c.prepare("UPDATE members SET role='owner' WHERE user_id=?").bind(W).run()).meta.changes,0);
  await assert.rejects(()=>a.prepare('UPDATE members SET organization_id=? WHERE user_id=?').bind(OTHER,W).run(),/immutable|row-level/);
  assert.equal((await a.prepare("UPDATE members SET role='owner' WHERE user_id=?").bind(V).run()).meta.changes,0);
 });
 await t.test('one pending chat reservation commits independently; failed query rolls back context',async()=>{
  const q="INSERT OR IGNORE INTO assistant_turns(user_id,request_id,prompt,context_json,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)";
  assert.equal((await a.prepare(q).bind(U,'req-1','hi','[]','now','now').run()).meta.changes,1);
  assert.equal((await a.prepare(q).bind(U,'req-2','hi','[]','now','now').run()).meta.changes,0);
  await assert.rejects(()=>a.prepare('SELECT missing_column FROM members').all());
  assert.equal((await pg.query('SELECT current_user AS role')).rows[0].role,'postgres');
  assert.equal((await b.prepare('SELECT * FROM assistant_turns WHERE user_id=?').bind(U).all()).results.length,0);
  assert.equal((await a.prepare('SELECT request_id FROM assistant_turns WHERE user_id=?').bind(U).first()).request_id,'req-1');
 });
 await t.test('suspended users lose private reads and writes; owners cannot read other private data',async()=>{
  assert.equal((await outsider.prepare('SELECT * FROM private_state').all()).results.length,0);
  await assert.rejects(()=>outsider.prepare('INSERT INTO private_state(user_id,key,value,version,updated_at) VALUES(?,?,?,?,?)').bind(O,'profile','{}',1,'now').run(),/row-level security/);
  await c.prepare('INSERT INTO private_state(user_id,key,value,version,updated_at) VALUES(?,?,?,?,?)').bind(W,'profile','{"name":"Private member"}',1,'now').run();
  assert.equal(await a.prepare('SELECT * FROM private_state WHERE user_id=?').bind(W).first(),null);
  assert.equal((await outsider.prepare('SELECT * FROM assistant_turns').all()).results.length,0);
 });
 await t.test('authority audit failure rolls back the authority change',async()=>{
  await pg.exec("CREATE FUNCTION xtreme_avatar_private.test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit unavailable'; END $$; CREATE TRIGGER test_audit_failure BEFORE INSERT ON xtreme_avatar.account_audit FOR EACH ROW EXECUTE FUNCTION xtreme_avatar_private.test_audit_failure();");
  await assert.rejects(()=>a.prepare("UPDATE members SET role='admin' WHERE user_id=?").bind(W).run(),/test audit unavailable/);
  assert.equal((await a.prepare('SELECT role FROM members WHERE user_id=?').bind(W).first()).role,'member');
  await pg.exec("DROP TRIGGER test_audit_failure ON xtreme_avatar.account_audit; DROP FUNCTION xtreme_avatar_private.test_audit_failure();");
  await a.prepare("UPDATE members SET role='admin' WHERE user_id=?").bind(W).run();
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM xtreme_avatar.account_audit WHERE action='members:update' AND target=$1",[W])).rows[0].n,1);
 });
 await t.test('admin cannot promote member or edit other organization authority',async()=>{
  await assert.rejects(()=>c.prepare("UPDATE members SET role='admin' WHERE user_id=?").bind(O).run(),/row-level security/);
  assert.equal((await c.prepare("UPDATE members SET status='suspended' WHERE user_id=?").bind(V).run()).meta.changes,0);
 });
 await t.test('v2 pre-controller rejections release only a fresh owned reservation; unknown/retried starts remain recoverable',async()=>{
  const env={AUTH_USER:user(U),DB:a,MIGRATED_IDENTITY:true,VOICE_V2_ENABLED:true,ACCESS_TOKEN:'fake.test.token',APP_ORIGIN:origin};
  const rid='77777777-7777-4777-8777-777777777777';
  const request=()=>new Request(origin+'/api/assistant/voice/start',{method:'POST',headers:{origin,'content-type':'application/json','x-xtreme-account':U},body:JSON.stringify({requestId:rid,sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'})});
  const saved=()=>a.prepare('SELECT value,version FROM private_state WHERE user_id=? AND key=?').bind(U,'assistant_voice_request').first();
  const clear=()=>a.prepare('DELETE FROM private_state WHERE user_id=? AND key=?').bind(U,'assistant_voice_request').run();
  const reasons={supabase_voice_not_configured:503,origin_denied:403,mixed_identity_headers:400,session_required:401,membership_or_session_required:403,confirmed_account_required:403,voice_membership_required:403,invalid_identity:401,identity_service_unavailable:503,invalid_private_context:400};
  for(const [reason,status] of Object.entries(reasons)){
   const response=await handleAssistantVoice(request(),env,async()=>{
    assert.equal((await saved()).version,2,'reservation and attempt ownership commit before external request');
    return Response.json({ok:false,reason},{status});
   });
   const body=await response.json();
   assert.equal(body.terminal,true,reason);assert.equal(body.code,reason);assert.equal(await saved(),null,reason);
  }
  const unknown=await handleAssistantVoice(request(),env,async()=>Response.json({ok:false,reason:'voice_temporarily_unavailable'},{status:503}));
  assert.equal((await unknown.json()).terminal,undefined);assert.ok(await saved());
  const retry=await handleAssistantVoice(request(),env,async()=>Response.json({ok:false,reason:'session_required'},{status:401}));
  assert.equal((await retry.json()).terminal,undefined,'auth failure cannot erase an earlier unknown start');
  assert.equal((await saved()).version,3);
  const retryConfig=await handleAssistantVoice(request(),env,async()=>Response.json({ok:false,reason:'provider_key_missing'},{status:503}));
  assert.equal((await retryConfig.json()).terminal,undefined,'existing pre-admission codes also cannot erase prior uncertainty');
  assert.equal((await saved()).version,4);await clear();
  const timeout=await handleAssistantVoice(request(),env,async()=>{throw new Error('simulated timeout');});
  assert.equal((await timeout.json()).terminal,undefined);assert.ok(await saved());await clear();
  // A waits for its upstream response while B retries the same request ID.
  // B claims a new version; A's later rejection must not delete B's recovery row.
  const concurrent=await handleAssistantVoice(request(),env,async()=>{
   const second=await handleAssistantVoice(request(),env,async()=>Response.json({ok:false,reason:'voice_temporarily_unavailable'},{status:503}));
   assert.equal((await second.json()).terminal,undefined);
   return Response.json({ok:false,reason:'session_required'},{status:401});
  });
  assert.equal((await concurrent.json()).terminal,undefined);
  assert.equal((await saved()).version,3);await clear();
  // Delete/recreate of the same request ID resets version; the internal nonce
  // prevents an old response from deleting the new reservation (ABA).
  let firstNonce;
  const recreated=await handleAssistantVoice(request(),env,async()=>{
   firstNonce=JSON.parse((await saved()).value).reservationId;await clear();
   const second=await handleAssistantVoice(request(),env,async()=>Response.json({ok:false,reason:'voice_temporarily_unavailable'},{status:503}));
   assert.equal((await second.json()).terminal,undefined);
   return Response.json({ok:false,reason:'session_required'},{status:401});
  });
  assert.equal((await recreated.json()).terminal,undefined);
  assert.equal((await saved()).version,2);assert.notEqual(JSON.parse((await saved()).value).reservationId,firstNonce);await clear();
  // Interleave between INSERT and readback: inserted ownership cannot be
  // transferred to a replacement row or a row already claimed by another start.
  for(const mode of ['replacement','priorClaim','claimRace']){
   let interleaved=false,providerCalls=0;
   function statement(query,args=[]){
    const base=a.prepare(query).bind(...args);
    return {
     bind(...next){return statement(query,next);},
     first(...cols){return base.first(...cols);},all(){return base.all();},
     async run(){
      if(mode==='claimRace'&&!interleaved&&query.startsWith('UPDATE private_state SET version=version+1')){
       interleaved=true;await a.prepare('UPDATE private_state SET version=version+1 WHERE user_id=? AND key=?').bind(U,'assistant_voice_request').run();
      }
      const result=await base.run();
      if(mode!=='claimRace'&&!interleaved&&query.startsWith('INSERT OR IGNORE INTO private_state')&&args[1]==='assistant_voice_request'){
       interleaved=true;
       if(mode==='replacement'){
        const replaced=[...args];replaced[2]=JSON.stringify({...JSON.parse(args[2]),reservationId:'88888888-8888-4888-8888-888888888888'});
        await clear();await a.prepare(query).bind(...replaced).run();
       }else await a.prepare('UPDATE private_state SET version=version+1 WHERE user_id=? AND key=?').bind(U,'assistant_voice_request').run();
      }
      return result;
     }
    };
   }
   const response=await handleAssistantVoice(request(),{...env,DB:{...a,prepare:statement}},async()=>{providerCalls++;return Response.json({ok:false,reason:'session_required'},{status:401});});
   assert.equal(response.status,409,mode);assert.equal((await response.json()).terminal,undefined,mode);
   assert.equal(providerCalls,0,mode+' aborts before provider dispatch');
   assert.equal((await saved()).version,mode==='replacement'?1:2,mode);
   await clear();
  }

 });
 await t.test('account handler reads/writes with fresh UUID and CAS',async()=>{
  const req=new Request(origin+'/api/account',{headers:{'oai-authenticated-user-id':V}});
  const response=await handleAccounts(req,{AUTH_USER:user(U),DB:a});
  assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.user.id,U);assert.equal(payload.data.profile.name,'Saved');
 });
 await pg.close();
});

test('explicit owner bootstrap verifies identity, is idempotent and never reactivates suspension',async()=>{
 const {PGlite}=await import(process.env.XTREME_PGLITE_MODULE||'@electric-sql/pglite');
 const pg=new PGlite();
 await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;");
 await pg.exec(await readFile(new URL('../supabase/migrations/202611070001_xtreme_avatar.sql',import.meta.url),'utf8'));
 const bootstrap=await readFile(new URL('../supabase/bootstrap/xtreme-avatar-owner.sql',import.meta.url),'utf8');
 const id='eca619af-f25b-4cf8-adde-e48cee0a96fc';
 await pg.query("INSERT INTO auth.users VALUES($1,'wrong@example.test',now(),false)",[id]);
 await assert.rejects(()=>pg.exec(bootstrap),/does not match/);await pg.exec('ROLLBACK');
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM xtreme_avatar.members')).rows[0].n,0);
 await pg.query("UPDATE auth.users SET email='jeremy@strategicmindsai.com' WHERE id=$1",[id]);
 await pg.exec(bootstrap);await pg.exec(bootstrap);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM xtreme_avatar.members')).rows[0].n,1);
 assert.equal((await pg.query("SELECT count(*)::int AS n FROM xtreme_avatar.account_audit WHERE action='database_admin:verified_initial_owner'")).rows[0].n,1);
 await pg.query("UPDATE xtreme_avatar.members SET status='suspended' WHERE user_id=$1",[id]);
 await assert.rejects(()=>pg.exec(bootstrap),/must not change privileges or reactivate/);await pg.exec('ROLLBACK');
 assert.equal((await pg.query('SELECT status FROM xtreme_avatar.members WHERE user_id=$1',[id])).rows[0].status,'suspended');
 await pg.close();
});

test('Supabase deployed and full gateway prefixes normalize with exact boundaries',async()=>{
 let verifyCalls=0;
 const deps={allowedOrigins:origin,verifyUser:async()=>{verifyCalls++;return null;},databaseFor:()=>{throw Error('not reached');}};
 for(const prefix of ['/functions/v1/xtreme-avatar-api','/xtreme-avatar-api','']){
  const path=prefix+'/api/account';
  const noAuth=await routeEdgeRequest(new Request('https://backend.test'+path,{headers:{origin}}),deps);
  assert.equal(noAuth.status,401,path+' must reach authentication, not 404');
  const invalidAuth=await routeEdgeRequest(new Request('https://backend.test'+path,{headers:{origin,authorization:'Bearer invalid'}}),deps);
  assert.equal(invalidAuth.status,401,path+' must verify supplied bearer');
 }
 assert.equal(verifyCalls,3);
 for(const path of ['/functions/v1/xtreme-avatar-api-other/api/account','/xtreme-avatar-api-other/api/account','/other/xtreme-avatar-api/api/account','/xtreme-avatar-api/api/unknown']){
  const response=await routeEdgeRequest(new Request('https://backend.test'+path,{headers:{origin,authorization:'Bearer invalid'}}),deps);
  assert.equal(response.status,404,path+' must remain outside route allowlist');
 }
 assert.equal(verifyCalls,3);
});

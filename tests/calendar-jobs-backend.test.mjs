import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createD1Adapter} from '../server/postgres-d1.mjs';
import {handleCalendarJob} from '../server/calendar-jobs.mjs';
import {createCalendarJobProxy} from '../server/calendar-job-proxy.mjs';
import {sniffJobFile} from '../server/job-files.mjs';
import {createJobStorage} from '../server/job-storage.mjs';
import {GOOGLE_APP_ORIGINS} from '../server/google-workspace-proxy.mjs';
const U='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222',W='33333333-3333-4333-8333-333333333333';
const ORG='8239c37e-9b5c-49bf-af9c-dd0dcd091047',OTHER='55555555-5555-4555-8555-555555555555',ORIGIN=GOOGLE_APP_ORIGINS[0],REF='ce1_'+'a'.repeat(64),ALT='ce1_'+'b'.repeat(64);
const user=id=>({id,email:id+'@test.invalid',email_confirmed_at:'2026-11-07T00:00:00Z',is_anonymous:false});
const details={jobId:null,client:'Client',location:'Site',stage:'scheduled',notes:'Private job notes'};
const PDF=new TextEncoder().encode('%PDF-1.7\nSynthetic test PDF\n%%EOF');
const rid=n=>('aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0'));
function request(path,{method='GET',body,bytes,headers={},id=U}={}){return new Request(ORIGIN+path,{method,headers:{origin:ORIGIN,'x-xtreme-account':id,'x-xtreme-connection-revision':'4',...(body?{'content-type':'application/json'}:{}),...(bytes?{'content-type':'application/octet-stream'}:{}),...headers},body:bytes??(body?JSON.stringify(body):undefined)});}
const binding=async args=>({eventId:args.eventId,eventRef:args.eventId==='second'?ALT:REF,connectionRevision:args.connectionRevision});
test('private calendar jobs/files: real isolated SQL, RLS, lifecycle, quotas and app handlers',async t=>{
 const pg=new PGlite();
 await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean DEFAULT false); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$; GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT USAGE ON SCHEMA storage TO authenticated,anon; GRANT ALL ON storage.objects TO authenticated,anon;");
 await pg.exec(await readFile(new URL('../supabase/migrations/202611070001_xtreme_avatar.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../supabase/migrations/20261107201240_calendar_private_files.sql',import.meta.url),'utf8'));
 for(const id of [U,V,W])await pg.query('INSERT INTO auth.users VALUES($1,$2,now(),false)',[id,user(id).email]);
 await pg.query("INSERT INTO xtreme_avatar.organizations VALUES($1,'Other',now())",[OTHER]);
 for(const [id,org,role]of [[U,ORG,'owner'],[V,ORG,'member'],[W,OTHER,'owner']])await pg.query('INSERT INTO xtreme_avatar.members VALUES($1,$2,$3,$4,\'active\',now()::text)',[id,org,user(id).email,role]);
 const client={begin:fn=>pg.transaction(async tx=>fn({unsafe:async(sql,args=[])=>{const r=await tx.query(sql,args);return Object.assign(r.rows,{count:r.affectedRows??r.rows.length});}}))};
 const db=createD1Adapter(client,user(U)),other=createD1Adapter(client,user(V)),foreign=createD1Adapter(client,user(W)),objects=new Map();
 let puts=0;
 const storage={async put(path,bytes,mime){puts++;if(objects.has(path))throw Error('No upsert');objects.set(path,bytes.slice());},async get(path){if(!objects.has(path))throw Error('Missing');return objects.get(path).slice();},async remove(path){objects.delete(path);}};
 const env={AUTH_USER:user(U),DB:db,ACCESS_TOKEN:'fake-valid-token',APP_ORIGIN:ORIGIN,FILE_STORAGE:storage},deps={resolveBinding:binding};
 const call=(path,options={},e=env,d=deps)=>handleCalendarJob(request(path,options),e,d);
 const save=(version,data=details,eventId='first')=>call('/api/calendar/job',{method:'POST',body:{eventId,version,data}});
 const reserve=(n,byteSize=PDF.length,eventId='first',jobVersion=1)=>call('/api/calendar/job-files/reserve',{method:'POST',body:{eventId,jobVersion,requestId:rid(n),fileName:'plan.pdf',mimeType:'application/pdf',byteSize}});
 let file;
 await t.test('metadata defaults, CAS, no copied Google content and project link existence',async()=>{
  const initial=await (await call('/api/calendar/job?eventId=first')).json();assert.equal(initial.version,0);assert.equal(initial.attachments.length,0);assert.equal(initial.eventRef,REF);
  assert.equal((await save(0,{...details,jobId:'missing'})).status,409);
  await db.prepare("INSERT INTO private_state(user_id,key,value,version,updated_at) VALUES(?, 'work_hub_v1', ?,1,'now')").bind(U,JSON.stringify({schema:1,jobs:[{id:'existing-job'}],results:[]})).run();
  assert.equal((await save(0,{...details,jobId:'existing-job'})).status,200);
  assert.equal((await save(0)).status,409);
  assert.equal((await save(1,{...details,jobId:'existing-job',owner:V})).status,400);
  const data=await (await call('/api/calendar/job?eventId=first')).json();assert.equal(data.job.jobId,'existing-job');assert.equal(data.projectMissing,false);assert.equal(data.version,1);
 });
 await t.test('missing/account-switched sessions, unbound refs and malformed routes fail closed',async()=>{
  assert.equal((await call('/api/calendar/job?eventId=first',{headers:{'x-xtreme-account':V}})).status,409);
  assert.equal((await call('/api/calendar/job?eventId=first',{}, {...env,AUTH_USER:null})).status,401);
  assert.equal((await call('/api/calendar/job?eventId=first&eventRef='+REF)).status,400);
  assert.equal((await call('/api/calendar/job?eventId=first',{headers:{'x-xtreme-connection-revision':'0'}})).status,400);
  assert.equal((await call('/api/calendar/job?eventId=first',{},env,{resolveBinding:async()=>({eventRef:'forged'})})).status,502);
  assert.equal((await call('/api/calendar/job?eventId=first',{method:'DELETE'})).status,405);
 });
 await t.test('reservation uses immutable server path and supports exact request replay',async()=>{
  const result=await reserve(1);assert.equal(result.status,200);const data=await result.json();file=data.attachment;assert.equal(file.status,'reserved');assert.equal(data.replayed,false);assert.equal('object_name' in file,false);
  const row=await db.prepare('SELECT * FROM job_attachments WHERE attachment_id=?').bind(file.id).first();assert.equal(row.job_id,'existing-job');assert.ok(row.object_name.startsWith(ORG+'/'+U+'/'+REF+'/'));
  const replay=await (await reserve(1)).json();assert.equal(replay.attachment.id,file.id);assert.equal(replay.replayed,true);
  assert.equal((await reserve(1,PDF.length+1)).status,409);
 });
 await t.test('raw upload validates bytes, commits hash and never overwrites on replay',async()=>{
  const path='/api/calendar/job-files/upload?eventId=first&attachmentId='+file.id;
  const invalid=await call(path,{method:'POST',bytes:new TextEncoder().encode('<svg>wrong type</svg>')});assert.equal(invalid.status,415);assert.equal(puts,0);
  const result=await call(path,{method:'POST',bytes:PDF});assert.equal(result.status,200);file=(await result.json()).attachment;assert.equal(file.status,'ready');assert.equal(puts,1);
  assert.equal((await call(path,{method:'POST',bytes:PDF})).status,200);assert.equal(puts,1);
 });
 await t.test('downloads are authenticated no-store attachment-only, with hash verification',async()=>{
  const response=await call('/api/calendar/job-files/content?eventId=first&attachmentId='+file.id);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('content-security-policy'),"default-src 'none'; sandbox");assert.deepEqual(new Uint8Array(await response.arrayBuffer()),PDF);
  const row=await db.prepare('SELECT * FROM job_attachments WHERE attachment_id=?').bind(file.id).first(),old=objects.get(row.object_name);objects.set(row.object_name,new Uint8Array([1]));
  assert.equal((await call('/api/calendar/job-files/content?eventId=first&attachmentId='+file.id)).status,503);objects.set(row.object_name,old);
 });
 await t.test('cross-user, owner-over-member and changed Google bindings cannot reach private files',async()=>{
  assert.equal(await other.prepare('SELECT * FROM job_attachments WHERE attachment_id=?').bind(file.id).first(),null);
  assert.equal(await foreign.prepare('SELECT * FROM job_attachments WHERE attachment_id=?').bind(file.id).first(),null);
  assert.equal((await call('/api/calendar/job-files/content?eventId=first&attachmentId='+file.id,{id:V},{...env,DB:other,AUTH_USER:user(V)})).status,404);
  assert.equal((await call('/api/calendar/job-files/content?eventId=second&attachmentId='+file.id)).status,404);
  const changed=await (await call('/api/calendar/job?eventId=first',{},env,{resolveBinding:async a=>({...await binding(a),eventRef:ALT})})).json();assert.equal(changed.version,0);assert.deepEqual(changed.attachments,[]);
 });
 await t.test('direct authenticated clients cannot forge manifest readiness or call trusted function',async()=>{
  await assert.rejects(()=>db.prepare("UPDATE job_attachments SET status='ready' WHERE attachment_id=?").bind(file.id).run(),/permission denied/);
  await assert.rejects(()=>db.prepare("INSERT INTO job_attachments(user_id) VALUES(?)").bind(U).run(),/permission denied/);
  await assert.rejects(()=>db.prepare("SELECT xtreme_avatar_private.file_mutation(?,?::jsonb)").bind('finish','{}').first(),/permission denied/);
 });
 await t.test('future permissive Storage policies still cannot bypass private ownership or upload validation',async()=>{
  await pg.exec("CREATE POLICY future_permissive ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true)");
  const row=await db.prepare('SELECT * FROM job_attachments WHERE attachment_id=?').bind(file.id).first();
  await pg.query("INSERT INTO storage.objects(bucket_id,name) VALUES('xtreme-avatar-job-files',$1),('assets','public')",[row.object_name]);
  assert.equal((await db.prepare('SELECT * FROM storage.objects').all()).results.length,1);
  assert.equal((await other.prepare('SELECT * FROM storage.objects').all()).results.length,1);
  await assert.rejects(()=>db.prepare("INSERT INTO storage.objects(bucket_id,name) VALUES('xtreme-avatar-job-files',?)").bind(row.object_name+'/evil').run(),/row-level security/);
  assert.equal((await db.prepare("DELETE FROM storage.objects WHERE bucket_id='xtreme-avatar-job-files'").run()).meta.changes,0);
  assert.equal((await db.prepare("UPDATE storage.objects SET name='other' WHERE bucket_id='xtreme-avatar-job-files'").run()).meta.changes,0);
 });
 await t.test('upload result lost after Storage success reconciles stored bytes without a repeat upload',async()=>{
  const r=await (await reserve(2)).json(),id=r.attachment.id;
  let lost=true;
  const flaky={...db,async fileOperation(op,input){if(op==='finish'&&lost){lost=false;throw Error('lost result');}return db.fileOperation(op,input);}};
  const before=puts;const response=await call('/api/calendar/job-files/upload?eventId=first&attachmentId='+id,{method:'POST',bytes:PDF},{...env,DB:flaky});assert.equal(response.status,503);
  const list=await (await call('/api/calendar/job?eventId=first')).json();assert.equal(list.attachments.find(f=>f.id===id).status,'ready');assert.equal(puts,before+1);
 });
 await t.test('delete requires explicit confirmation/version; replay is safe',async()=>{
  assert.equal((await call('/api/calendar/job-files/remove',{method:'POST',body:{eventId:'first',attachmentId:file.id,version:file.version,confirm:false}})).status,400);
  const response=await call('/api/calendar/job-files/remove',{method:'POST',body:{eventId:'first',attachmentId:file.id,version:file.version,confirm:true}});assert.equal(response.status,200);
  assert.equal((await call('/api/calendar/job-files/content?eventId=first&attachmentId='+file.id)).status,409);
  assert.equal((await call('/api/calendar/job-files/remove',{method:'POST',body:{eventId:'first',attachmentId:file.id,version:file.version,confirm:true}})).status,200);
 });
 await t.test('atomic per-event quota includes pending uploads; deleted files release capacity',async()=>{
  for(let i=3;i<=11;i++)assert.equal((await reserve(i)).status,200);
  assert.equal((await reserve(12)).status,409);
 });
 await t.test('suspended members lose private metadata, file reads and trusted mutation authority',async()=>{
  await pg.query("UPDATE xtreme_avatar.members SET status='suspended' WHERE user_id=$1",[U]);
  assert.equal((await call('/api/calendar/job?eventId=first')).status,403);
  assert.equal((await db.prepare('SELECT * FROM job_attachments').all()).results.length,0);
  const r=await db.fileOperation('reserve',{eventRef:REF});assert.equal(r.code,'access_required');
  await pg.query("UPDATE xtreme_avatar.members SET status='active' WHERE user_id=$1",[U]);
 });

 await t.test('ready upload replay must match the original bytes and hash',async()=>{
  const row=(await db.prepare("SELECT * FROM job_attachments WHERE status='ready' LIMIT 1").all()).results[0];
  if(!row)return;
  const altered=PDF.slice();altered[12]=altered[12]===65?66:65;
  assert.equal((await call('/api/calendar/job-files/upload?eventId=first&attachmentId='+row.attachment_id,{method:'POST',bytes:altered})).status,409);
  const claim=await db.fileOperation('claim',{id:row.attachment_id,eventRef:REF,sha256:'0'.repeat(64)});assert.equal(claim.code,'attachment_changed');
 });
 await t.test('anonymous reads of unrelated Storage objects remain unaffected',async()=>{
  await pg.exec("CREATE POLICY future_anon_read ON storage.objects FOR SELECT TO anon USING(true)");
  await pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');const r=await tx.query('SELECT * FROM storage.objects');assert.equal(r.rows.length,1);assert.equal(r.rows[0].bucket_id,'assets');});
 });
 await t.test('changing org cannot replay an old org reservation through the trusted function',async()=>{
  await pg.query('UPDATE xtreme_avatar.job_attachments SET organization_id=$1 WHERE user_id=$2 AND request_id=$3',[OTHER,U,rid(2)]);
  const result=await db.fileOperation('reserve',{eventRef:REF,jobVersion:1,jobId:'existing-job',requestId:rid(2),fileName:'plan.pdf',mimeType:'application/pdf',byteSize:PDF.length});assert.equal(result.code,'duplicate_request');
  await pg.query('UPDATE xtreme_avatar.job_attachments SET organization_id=$1 WHERE user_id=$2 AND request_id=$3',[ORG,U,rid(2)]);
 });
 await t.test('expired upload lease never proves a delayed provider put is safe to delete',async()=>{
  assert.equal((await save(0,details,'second')).status,200);
  const data=await (await reserve(100,PDF.length,'second')).json(),id=data.attachment.id;
  let enter,release;const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const delayed={...storage,async put(path,bytes,mime){enter();await gate;await storage.put(path,bytes,mime);}};
  const pending=call('/api/calendar/job-files/upload?eventId=second&attachmentId='+id,{method:'POST',bytes:PDF},{...env,FILE_STORAGE:delayed});
  await entered;
  await pg.query("UPDATE xtreme_avatar.job_attachments SET upload_expires_at=now()-interval '1 hour' WHERE attachment_id=$1",[id]);
  const row=await db.prepare('SELECT * FROM job_attachments WHERE attachment_id=?').bind(id).first();
  const denied=await call('/api/calendar/job-files/remove',{method:'POST',body:{eventId:'second',attachmentId:id,version:row.version,confirm:true}});assert.equal(denied.status,409);
  release();assert.equal((await pending).status,200);
  const ready=await db.prepare('SELECT * FROM job_attachments WHERE attachment_id=?').bind(id).first();assert.equal(ready.status,'ready');
  assert.equal((await call('/api/calendar/job-files/remove',{method:'POST',body:{eventId:'second',attachmentId:id,version:ready.version,confirm:true}})).status,200);
  assert.equal(objects.has(ready.object_name),false);
 });
 await t.test('Google account changes during a private read suppress the bytes after the final binding check',async()=>{
  const row=(await db.prepare("SELECT * FROM job_attachments WHERE status='ready' LIMIT 1").all()).results[0];
  if(!row)return;
  let changed=false;
  const changingStorage={...storage,async get(path){const bytes=await storage.get(path);changed=true;return bytes;}};
  const resolver=async args=>({...await binding(args),eventRef:changed?ALT:REF});
  const r=await call('/api/calendar/job-files/content?eventId=first&attachmentId='+row.attachment_id,{}, {...env,FILE_STORAGE:changingStorage},{resolveBinding:resolver});
  assert.equal(r.status,409);assert.equal(r.headers.get('content-type').startsWith('application/json'),true);assert.equal((await r.text()).includes('Synthetic test PDF'),false);
 });

 await t.test('unknown deletes keep tombstone; failures do not reset pooled claims/role',async()=>{
  const row=(await db.prepare("SELECT * FROM job_attachments WHERE status='ready' LIMIT 1").all()).results[0];
  const failStorage={...storage,async remove(){throw Error('lost');}};
  assert.equal((await call('/api/calendar/job-files/remove',{method:'POST',body:{eventId:'first',attachmentId:row.attachment_id,version:row.version,confirm:true}},{...env,FILE_STORAGE:failStorage})).status,503);
  const current=await db.prepare('SELECT * FROM job_attachments WHERE attachment_id=?').bind(row.attachment_id).first();assert.equal(current.status,'deleting');
  assert.equal((await call('/api/calendar/job-files/remove',{method:'POST',body:{eventId:'first',attachmentId:row.attachment_id,version:current.version,confirm:true}})).status,200);
  await assert.rejects(()=>db.fileOperation('unreviewed',{}));
  const role=await pg.query("SELECT current_user AS role,current_setting('request.jwt.claims',true) AS claims");assert.equal(role.rows[0].role,'postgres');assert.ok(!role.rows[0].claims);
 });

 await t.test('per-user byte quota is enforced across separate event contexts',async()=>{
  let rejected=false,accepted=0;
  for(let context=0;context<6&&!rejected;context++){
   const ref='ce1_'+(1000+context).toString(16).padStart(64,'0');
   await db.prepare('INSERT INTO private_state(user_id,key,value,version,updated_at) VALUES(?,?,?,1,?)').bind(U,'calendar_job_v1:'+ref,JSON.stringify({schema:1,job:details}),'now').run();
   for(let i=0;i<10;i++){
    const r=await db.fileOperation('reserve',{eventRef:ref,jobVersion:1,jobId:null,requestId:rid(1000+context*10+i),fileName:'large.pdf',mimeType:'application/pdf',byteSize:4000000});
    if(!r.ok){assert.equal(r.code,'storage_limit');rejected=true;break;}accepted++;
   }
  }
  assert.equal(rejected,true);assert.ok(accepted>40);
  const used=await db.prepare("SELECT SUM(byte_size) AS bytes FROM job_attachments WHERE user_id=? AND status NOT IN ('deleted','failed')").bind(U).first();assert.ok(Number(used.bytes)<=200000000);
 });

 await pg.close();
});
test('file sniff rejects active or mislabeled content and oversized uploads',()=>{
 assert.equal(sniffJobFile(PDF,'application/pdf'),true);
 for(const mime of ['image/jpeg','image/png','image/webp','image/svg+xml','text/html'])assert.equal(sniffJobFile(new TextEncoder().encode('<svg onload=evil/>'),mime),false);
 assert.equal(sniffJobFile(new Uint8Array(4000001),'application/pdf'),false);
});
test('private Storage transport is fixed-host/path, no upsert, bounded and never accepts arbitrary URL',async()=>{
 const calls=[];const storage=createJobStorage({url:'https://example.supabase.co',serverKey:'test-only-not-secret',fetcher:async(url,options)=>{calls.push({url,options});return new Response(PDF);}});
 await assert.rejects(()=>storage.get('https://evil.test/path'));assert.equal(calls.length,0);
 const path=ORG+'/'+U+'/'+REF+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf';await storage.put(path,PDF,'application/pdf');assert.equal(calls[0].options.headers['x-upsert'],'false');assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.cache,'no-store');
 assert.equal(createJobStorage({url:'https://evil.test',serverKey:'x'}),null);
});
test('Next private job proxy verifies fresh session, exact origin/account and forwards fixed path only',async()=>{
 const calls=[],order=[];let who=U,session=U;
 const proxy=createCalendarJobProxy({authClient:async()=>({auth:{getUser:async()=>{order.push('user');return {data:{user:user(who)}};},getSession:async()=>{order.push('session');return {data:{session:{user:{id:session},access_token:'fake-token'}}};}}}),publicConfig:()=>({url:'https://example.supabase.co',key:'public-key'}),fetcher:async(url,options)=>{calls.push({url,options});return Response.json({eventId:'first',eventRef:REF,version:0,job:details,projectMissing:false,attachments:[],capabilities:{attachments:true}});}});
 assert.equal((await proxy(request('/api/calendar/job?eventId=first'))).status,200);assert.deepEqual(order,['user','session']);assert.equal(calls[0].url,'https://example.supabase.co/functions/v1/xtreme-avatar-api/api/calendar/job?eventId=first');assert.equal(calls[0].options.headers['x-xtreme-account'],U);
 session=V;assert.equal((await proxy(request('/api/calendar/job?eventId=first'))).status,401);session=U;
 for(const options of [{headers:{origin:'https://evil.test'}},{headers:{authorization:'Bearer attacker'}},{headers:{'x-xtreme-user-id':V}},{headers:{'x-xtreme-account':V}}])assert.ok((await proxy(request('/api/calendar/job?eventId=first',options))).status>=400);
 assert.equal((await proxy(request('/api/calendar/job?eventId=first&url=https://evil.test'))).status,400);
});

test('Next proxy rejects unbounded or active responses and redacts unknown provider errors',async()=>{
 const authClient=async()=>({auth:{getUser:async()=>({data:{user:user(U)}}),getSession:async()=>({data:{session:{user:{id:U},access_token:'fake-token'}}})}});
 const build=response=>createCalendarJobProxy({authClient,publicConfig:()=>({url:'https://example.supabase.co',key:'public-key'}),fetcher:async()=>response});
 for(const response of [new Response('<script>PRIVATE</script>',{headers:{'content-type':'text/html'}}),new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}})]){
  const r=await build(response)(request('/api/calendar/job?eventId=first'));assert.ok(r.status>=500);assert.equal((await r.text()).includes('PRIVATE'),false);
 }
 const hidden=await build(Response.json({code:'unknown',error:'PRIVATE TOKEN',refresh_token:'PRIVATE'},{status:503}))(request('/api/calendar/job?eventId=first'));assert.equal((await hidden.text()).includes('PRIVATE'),false);
 for(const response of [new Response(PDF,{headers:{'content-type':'text/html','content-disposition':'attachment'}}),new Response(PDF,{headers:{'content-type':'application/pdf','content-disposition':'inline'}}),new Response(new Uint8Array(4000001),{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="x.pdf"'}})]){
  const r=await build(response)(request('/api/calendar/job-files/content?eventId=first&attachmentId='+rid(1)));assert.ok(r.status>=500);
 }
 const safe=await build(new Response(PDF,{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="x.pdf"'}}))(request('/api/calendar/job-files/content?eventId=first&attachmentId='+rid(1)));
 assert.equal(safe.status,200);assert.equal(safe.headers.get('content-disposition'),'attachment; filename="job-file.pdf"');assert.equal(safe.headers.get('content-security-policy'),"default-src 'none'; sandbox");
});

test('private deletion honors pre-aborted shared deadline without dispatch',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const storage=createJobStorage({url:'https://example.supabase.co',serverKey:'synthetic-test-key',fetcher:async()=>{calls++;return new Response('{}');}});
 const name=ORG+'/'+U+'/'+REF+'/'+rid(999)+'.pdf';
 await assert.rejects(()=>storage.remove(name,{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);
});

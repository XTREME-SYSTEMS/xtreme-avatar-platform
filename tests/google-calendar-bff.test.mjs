import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGoogleWorkspaceHandlers,GOOGLE_APP_ORIGINS,GOOGLE_RUNTIME_ORIGIN} from '../server/google-workspace-proxy.mjs';
const ORIGIN=GOOGLE_APP_ORIGINS[0],UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const NOW=Date.parse('2026-11-07T12:00:00.000Z'),DAY=86400000;
const iso=ms=>new Date(ms).toISOString();
const event=()=>({id:'cal_event_1',title:'Site meeting',start:iso(NOW+3600000),end:iso(NOW+7200000),allDay:false,location:'Job site'});
const payload=()=>({state:'ready',timeZone:'America/New_York',rangeStart:iso(NOW),rangeEnd:iso(NOW+7*DAY),events:[event()],hasMore:false});
function fixture({user={id:UID,email_confirmed_at:'confirmed',is_anonymous:false},sessionId=UID,response=payload(),status=200,fetcher}={}){
 const calls=[],order=[];
 const authClient=async()=>({auth:{
  getUser:async()=>{order.push('getUser');return {data:{user},error:null};},
  getSession:async()=>{order.push('getSession');return {data:{session:{user:{id:sessionId},access_token:'fake.valid.token'}},error:null};}
 }});
 const handlers=createGoogleWorkspaceHandlers({authClient,now:()=>NOW,fetcher:async(url,options)=>{calls.push({url,options});return fetcher?fetcher(url,options):Response.json(response,{status});}});
 return {...handlers,calls,order};
}
function request({origin=ORIGIN,headers={},method='GET',query='',signal}={}){
 return new Request(origin+'/api/connections/google/calendar'+query,{method,headers:{'x-xtreme-account':UID,'x-xtreme-connection-revision':'4',...headers},signal});
}
test('Calendar GET uses fresh cookie identity and forwards only fixed POST with empty JSON and revision',async()=>{
 const f=fixture(),r=await f.api(request());assert.equal(r.status,200);assert.deepEqual(f.order,['getUser','getSession']);
 assert.equal(f.calls.length,1);const call=f.calls[0];assert.equal(call.url,GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/calendar');
 assert.equal(call.options.method,'POST');assert.equal(call.options.body,'{}');assert.equal(call.options.redirect,'manual');assert.equal(call.options.cache,'no-store');
 assert.deepEqual(call.options.headers,{'content-type':'application/json',accept:'application/json',authorization:'Bearer fake.valid.token',origin:ORIGIN,'x-xtreme-account':UID,'x-xtreme-connection-revision':'4'});
 assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('vary'),'Cookie');
 assert.deepEqual(await r.json(),payload());
});
test('Calendar missing/anonymous/unconfirmed session never retrieves token or reaches runtime',async()=>{
 for(const user of [null,{id:UID,email_confirmed_at:null,is_anonymous:false},{id:UID,email_confirmed_at:'yes',is_anonymous:true}]){
  const f=fixture({user});assert.equal((await f.api(request())).status,401);assert.deepEqual(f.order,['getUser']);assert.equal(f.calls.length,0);
 }
});
test('Calendar changed session or account fence blocks before runtime',async()=>{
 const switched=fixture({sessionId:OTHER});assert.equal((await switched.api(request())).status,401);assert.equal(switched.calls.length,0);
 for(const id of [OTHER,'']){
  const f=fixture();assert.equal((await f.api(request({headers:{'x-xtreme-account':id}}))).status,409);assert.equal(f.calls.length,0);
 }
});
test('Calendar rejects unsupported methods and every query rather than accepting chosen dates, calendar or URL',async()=>{
 for(const method of ['POST','PUT','DELETE','PATCH']){
  const f=fixture();assert.equal((await f.api(request({method}))).status,405);assert.equal(f.calls.length,0);
 }
 for(const query of ['?calendarId=other','?from=2020-01-01','?url=https://evil.test','?revision=4']){
  const f=fixture();assert.equal((await f.api(request({query}))).status,404);assert.equal(f.calls.length,0);
 }
});
test('Calendar exact origin check and spoofed identity channels fail closed',async()=>{
 for(const options of [{origin:'https://evil.test'},{headers:{origin:'https://evil.test'}},{headers:{origin:'null'}},{headers:{'sec-fetch-site':'cross-site'}}]){
  const f=fixture();assert.equal((await f.api(request(options))).status,403);assert.equal(f.calls.length,0);
 }
 for(const headers of [{authorization:'Bearer attacker'},{'x-api-key':'attacker'},{'oai-authenticated-user-id':OTHER},{'x-oai-user-id':OTHER},{'x-xtreme-user-id':OTHER},{'x-xtreme-session':'other'},{'x-user-id':OTHER},{'x-organization-id':'other'}]){
  const f=fixture();assert.equal((await f.api(request({headers}))).status,400);assert.equal(f.calls.length,0);
 }
});
test('Calendar requires an exact positive safe integer connection revision and no body headers',async()=>{
 for(const revision of ['', '0','-1','01','1e3','1,2','9007199254740992','x']){
  const f=fixture(),r=await f.api(request({headers:{'x-xtreme-connection-revision':revision}}));assert.equal(r.status,400);assert.equal((await r.json()).code,'connection_revision_required');assert.equal(f.calls.length,0);
 }
 for(const headers of [{'content-length':'12'},{'transfer-encoding':'chunked'}]){
  const f=fixture();assert.equal((await f.api(request({headers}))).status,400);assert.equal(f.calls.length,0);
 }
});
test('Calendar feature/scope/reconnect/revision/provider errors use only fixed allowlisted messages',async()=>{
 const errors={calendar_disabled:503,google_connection_required:409,calendar_scope_required:403,connection_changed:409,connection_revision_required:400,calendar_rate_limited:429,calendar_reconnect_required:409,calendar_api_disabled:503,calendar_unavailable:503,calendar_response_invalid:502,calendar_timeout:504,setup_required:503,identity_service_unavailable:503,connection_configuration_changed:503,refresh_pending:409,refresh_unconfirmed:503,reconnect_required:409,account_changed:403};
 for(const [code,status]of Object.entries(errors)){
  const f=fixture({status,response:{ok:false,code,error:'PRIVATE provider details',access_token:'PRIVATE token'}}),r=await f.api(request());
  assert.equal(r.status,status,code);const raw=await r.text();assert.equal(raw.includes('PRIVATE'),false,code);assert.equal(JSON.parse(raw).code,code);
 }
});
test('Calendar unknown or malformed error bodies never disclose provider fields',async()=>{
 for(const response of [{code:'__proto__',error:'PRIVATE'},{code:'unknown_failure',error:'PRIVATE',refresh_token:'PRIVATE'},['PRIVATE'],null]){
  const f=fixture({status:503,response}),r=await f.api(request());assert.equal(r.status,503);assert.equal((await r.text()).includes('PRIVATE'),false);
 }
 const f=fixture({status:401,response:{code:'stable_session_required',error:'PRIVATE'}});
 const r=await f.api(request());assert.equal(r.status,401);assert.equal((await r.json()).code,'sign_in_required');
 const g=fixture({fetcher:async()=>new Response('PRIVATE'.repeat(1400),{status:503})});assert.equal((await g.api(request())).status,503);
});
test('Calendar rejects runtime redirects and suppresses canceled or transport-failed reads',async()=>{
 const redirect=fixture({fetcher:async()=>new Response(null,{status:302,headers:{location:'https://evil.test/?token=PRIVATE'}})});
 const redir=await redirect.api(request());assert.equal(redir.status,502);assert.equal(redir.headers.get('location'),null);
 const failed=fixture({fetcher:async()=>{throw new Error('PRIVATE network detail');}});
 const error=await failed.api(request());assert.equal(error.status,503);assert.equal((await error.text()).includes('PRIVATE'),false);
 const controller=new AbortController(),cancelled=fixture({fetcher:async()=>{controller.abort();return Response.json(payload());}});
 const result=await cancelled.api(request({signal:controller.signal}));assert.equal(result.status,503);assert.equal(cancelled.calls[0].options.signal.aborted,true);assert.equal((await result.text()).includes('Site meeting'),false);
 const already=new AbortController();already.abort();const noCall=fixture();assert.equal((await noCall.api(request({signal:already.signal}))).status,503);assert.equal(noCall.calls.length,0);
});
test('Calendar schema rejects wrong states, invalid timezone, event count, pagination and missing fields',async()=>{
 for(const response of [
  {...payload(),state:'connected'},{...payload(),timeZone:'Mars/Unknown'},
  {...payload(),timeZone:'UTC\nPRIVATE'},{...payload(),hasMore:'true'},
  {...payload(),events:Array.from({length:26},(_,i)=>({...event(),id:'e'+i}))},
  {...payload(),events:[event(),event()]},{...payload(),events:{}},
  {...payload(),events:[{...event(),location:undefined}]}
 ]){
  const f=fixture({response}),r=await f.api(request());assert.equal(r.status,502);assert.equal((await r.json()).code,'calendar_response_invalid');
 }
});
test('Calendar window is fresh and exactly seven days, with strict valid UTC dates',async()=>{
 for(const response of [
  {...payload(),rangeEnd:iso(NOW+8*DAY)},
  {...payload(),rangeStart:iso(NOW-6*60000),rangeEnd:iso(NOW-6*60000+7*DAY)},
  {...payload(),rangeStart:iso(NOW+2*60000),rangeEnd:iso(NOW+2*60000+7*DAY)},
  {...payload(),rangeStart:'2026-02-30T12:00:00Z'},
  {...payload(),rangeStart:'2026-11-07T12:00:00.123456Z'},
  {...payload(),rangeStart:'2026-11-07T07:00:00-05:00'}
 ])assert.equal((await fixture({response}).api(request())).status,502);
});
test('Calendar events require valid date/datetime, order and range overlap',async()=>{
 for(const e of [
  {...event(),start:'not-a-date'}, {...event(),end:event().start},
  {...event(),start:iso(NOW+8*DAY),end:iso(NOW+9*DAY)},
  {...event(),start:iso(NOW-2*DAY),end:iso(NOW)},
  {...event(),start:'2026-11-07T13:00:00.123456Z'},
  {...event(),allDay:true,start:'2026-02-30',end:'2026-03-02'},
  {...event(),allDay:true,start:'2026-11-20',end:'2026-11-21'},
  {...event(),allDay:'true'}
 ])assert.equal((await fixture({response:{...payload(),events:[e]}}).api(request())).status,502);
 const allDay={...event(),allDay:true,start:'2026-11-07',end:'2026-11-08'};
 const ongoing={...event(),id:'ongoing',start:iso(NOW-DAY),end:iso(NOW+DAY)};
 assert.equal((await fixture({response:{...payload(),events:[allDay,ongoing]}}).api(request())).status,200);
});
test('Calendar bounds use shared UTF-16 caps and reject oversized identifiers or text',async()=>{
 const valid={...event(),id:'a'.repeat(256),title:'😀'.repeat(100),location:'😀'.repeat(150)};
 assert.equal((await fixture({response:{...payload(),events:[valid]}}).api(request())).status,200);
 for(const e of [{...valid,id:'a'.repeat(257)},{...valid,title:'😀'.repeat(101)},{...valid,location:'😀'.repeat(151)},{...valid,id:'https://private.google.test'}]){
  assert.equal((await fixture({response:{...payload(),events:[e]}}).api(request())).status,502);
 }
});
test('Calendar projection strips unknown private fields, HTML, URLs and controls',async()=>{
 const raw={...payload(),access_token:'PRIVATE TOKEN',nextPageToken:'PRIVATE NEXT',events:[{...event(),title:'<b>Meeting</b> https://meet.google.com/PRIVATE',location:'Site\u0000 <script>ignore</script> www.private.test',description:'PRIVATE DESCRIPTION',attendees:['PRIVATE PERSON'],htmlLink:'https://google.test/PRIVATE'}]};
 const response=await fixture({response:raw}).api(request());assert.equal(response.status,200);
 const data=await response.json();assert.deepEqual(Object.keys(data).sort(),['state','timeZone','rangeStart','rangeEnd','events','hasMore'].sort());
 assert.deepEqual(Object.keys(data.events[0]).sort(),['id','title','start','end','allDay','location'].sort());
 assert.equal(data.events[0].title,'Meeting');assert.equal(JSON.stringify(data).includes('PRIVATE'),false);assert.equal(JSON.stringify(data).includes('<'),false);
});
test('Calendar response byte bounds and fatal UTF-8 remain enforced',async()=>{
 const large=fixture({fetcher:async()=>new Response(' '.repeat(65537))});assert.equal((await large.api(request())).status,502);
 const bad=fixture({fetcher:async()=>new Response(new Uint8Array([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d]))});assert.equal((await bad.api(request())).status,502);
});
test('Connection snapshot enables only authorized explicitly enabled Calendar; no other tool is activated',async()=>{
 const status={state:'connected',configured:true,account:{email:'member@example.test',displayName:'Member'},revision:4,hasSavedConnection:true,services:[{id:'calendar',authorized:true,enabled:true},{id:'gmail',authorized:true,enabled:true},{id:'tasks',authorized:true,enabled:true}]};
 const f=fixture({response:status}),r=await f.api(new Request(ORIGIN+'/api/connections/google/status',{headers:{'x-xtreme-account':UID}}));
 const data=await r.json();assert.deepEqual(data.services.map(x=>[x.id,x.enabled]),[['calendar',true],['gmail',false],['tasks',false]]);
 const g=fixture({response:{...status,services:[{id:'calendar',authorized:false,enabled:true}]}});
 assert.equal((await (await g.api(new Request(ORIGIN+'/api/connections/google/status',{headers:{'x-xtreme-account':UID}}))).json()).services[0].enabled,false);
});

test('Actual Python Calendar adapter fixture survives the BFF without timestamp or Unicode contract drift',async()=>{
 const emitted=JSON.parse(await readFile(new URL('./fixtures/google-calendar-runtime.json',import.meta.url),'utf8'));
 const f=fixture({response:emitted}),r=await f.api(request());
 assert.equal(r.status,200);
 const actual=await r.json();assert.deepEqual(actual,emitted);
 assert.equal(actual.rangeStart,'2026-11-07T12:00:00Z');
 assert.equal(actual.rangeEnd,'2026-11-14T12:00:00Z');
 assert.equal(Date.parse(actual.rangeEnd)-Date.parse(actual.rangeStart),7*DAY);
 assert.equal(actual.events.length,2);assert.equal(actual.hasMore,true);
 assert.equal(actual.events[0].allDay,true);assert.equal(actual.events[0].start,'2026-11-07');assert.equal(actual.events[0].end,'2026-11-08');
 assert.equal(actual.events[1].start,'2026-11-07T13:00:00.123Z');assert.equal(actual.events[1].end,'2026-11-07T14:00:00.987Z');
 assert.equal(actual.events[1].title.length,200);assert.equal(actual.events[1].location.length,300);
 assert.ok(Buffer.byteLength(JSON.stringify(actual),'utf8')<65536);
});

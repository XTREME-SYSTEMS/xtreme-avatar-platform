import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarWorkspaceHandler} from '../server/calendar-workspace-proxy.mjs';
import {resolveCalendarBinding} from '../server/calendar-binding.mjs';
import {createGoogleWorkspaceHandlers,GOOGLE_APP_ORIGINS,GOOGLE_RUNTIME_ORIGIN} from '../server/google-workspace-proxy.mjs';
const O=GOOGLE_APP_ORIGINS[0],U='11111111-1111-4111-8111-111111111111',R='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',REF='ce1_'+'a'.repeat(64),NOW=Date.parse('2026-11-07T12:00:00Z');
const times={start:'2026-11-07T13:00:00.000Z',end:'2026-11-07T14:00:00.000Z',allDay:false};
const range={rangeStart:'2026-11-01T04:00:00.000Z',rangeEnd:'2026-12-13T05:00:00.000Z'};
const event=()=>({id:'ev1',eventRef:REF,title:'Garage installation',...times,location:'Test job'});
const draft=()=>({title:'Garage installation',notes:'One\ntwo',location:'Test job',...times,timeZone:'America/New_York'});
const payload=()=>({state:'ready',timeZone:'America/New_York',...range,events:[event()],hasMore:false,nextCursor:null,capped:false});
const caps={read:true,create:true,manageOwn:true};
function fixture({response=payload(),status=200,user={id:U,email_confirmed_at:'yes',is_anonymous:false},sessionId=U,fetcher}={}){
 const calls=[],order=[];
 const authClient=async()=>({auth:{getUser:async()=>{order.push('getUser');return {data:{user}};},getSession:async()=>{order.push('getSession');return {data:{session:{user:{id:sessionId},access_token:'synthetic.token'}}};}}});
 const forward=async(url,options)=>{calls.push({url,options});return fetcher?fetcher(url,options):Response.json(response,{status});};
 return {api:createCalendarWorkspaceHandler({authClient,fetcher:forward,now:()=>NOW}),legacy:createGoogleWorkspaceHandlers({authClient,fetcher:forward,now:()=>NOW}),calls,order,forward};
}
function req(action='range',body=range,{origin=O,headers={},method='POST',signal,query=''}={}){
 return new Request(origin+'/api/connections/google/calendar/'+action+query,{method,headers:{origin,'content-type':'application/json','x-xtreme-account':U,'x-xtreme-connection-revision':'4',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{}),signal});
}
test('ranged read is cookie-verified, primary fixed-runtime POST, no store and preserves 42-day DST window',async()=>{
 const f=fixture(),r=await f.api(req());assert.equal(r.status,200);assert.deepEqual(await r.json(),payload());assert.deepEqual(f.order,['getUser','getSession']);
 assert.equal(f.calls[0].url,GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/calendar/range');assert.equal(f.calls[0].options.redirect,'manual');assert.equal(f.calls[0].options.headers.authorization,'Bearer synthetic.token');assert.equal(f.calls[0].options.headers['x-xtreme-connection-revision'],'4');
 assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('vary'),'Cookie');
});
test('anonymous, unconfirmed, switched and wrong-account requests do not reach runtime',async()=>{
 for(const user of [null,{id:U,email_confirmed_at:null},{id:U,email_confirmed_at:'yes',is_anonymous:true}]){const f=fixture({user});assert.equal((await f.api(req())).status,401);assert.equal(f.calls.length,0);}
 const f=fixture({sessionId:OTHER});assert.equal((await f.api(req())).status,401);assert.equal(f.calls.length,0);
 const g=fixture();assert.equal((await g.api(req('range',range,{headers:{'x-xtreme-account':OTHER}}))).status,409);assert.equal(g.calls.length,0);
});
test('foreign origin, query, GET and spoofed credentials are rejected before provider',async()=>{
 const cases=[['range',range,{origin:'https://evil.test'},403],['range',range,{headers:{origin:'https://evil.test'}},403],['range',range,{method:'GET'},405],['range',range,{query:'?url=https://evil.test'},404]];
 for(const [a,b,o,s]of cases){const f=fixture();assert.equal((await f.api(req(a,b,o))).status,s);assert.equal(f.calls.length,0);}
 for(const h of [{authorization:'Bearer evil'},{'x-api-key':'evil'},{'oai-authenticated-user-id':OTHER},{'x-xtreme-user-id':OTHER},{'x-organization-id':OTHER}]){const f=fixture();assert.equal((await f.api(req('range',range,{headers:h}))).status,400);assert.equal(f.calls.length,0);}
});
test('revision and bounded range are validated exactly',async()=>{
 for(const revision of ['','0','01','1e4','9007199254740992']){const f=fixture();assert.equal((await f.api(req('range',range,{headers:{'x-xtreme-connection-revision':revision}}))).status,400);assert.equal(f.calls.length,0);}
 for(const value of [{...range,calendarId:'other'},{...range,rangeStart:'2026-02-30T00:00:00Z'},{...range,rangeEnd:'2027-01-01T00:00:00Z'},{...range,cursor:'wrong'},{...range,cursor:null}]){const f=fixture();assert.equal((await f.api(req('range',value))).status,400);assert.equal(f.calls.length,0);}
});
test('range rejects mixed schemas, duplicates, wrong windows and unknown timezones',async()=>{
 for(const response of [{...payload(),timeZone:'Mars/Unknown'},{...payload(),events:[event(),event()]},{...payload(),rangeStart:'2026-10-01T00:00:00Z'},{...payload(),events:[{...event(),eventRef:OTHER}]},{...payload(),nextCursor:'a'.repeat(30)},{...payload(),events:Array.from({length:51},(_,i)=>({...event(),id:'e'+i}))}]){
  assert.equal((await fixture({response}).api(req())).status,502);
 }
});
test('valid pagination keeps opaque cursor and discards unrecognized provider fields',async()=>{
 const response={...payload(),hasMore:true,nextCursor:'a'.repeat(43),providerToken:'PRIVATE'};
 const r=await fixture({response}).api(req());assert.equal(r.status,200);assert.equal((await r.text()).includes('PRIVATE'),false);
});
test('event detail returns safe plain notes and fixed Google links only',async()=>{
 const response={state:'ready',event:{...event(),etag:'"1"',notes:'Plain <b>text</b>',timeZone:'America/New_York',editable:true,editReason:null,googleUrl:'https://www.google.com/calendar/event?eid=abc',driveLinks:[{title:'Plan',url:'https://drive.google.com/file/d/test/view',mimeType:'application/pdf'}]},capabilities:caps};
 const r=await fixture({response}).api(req('event',{eventId:'ev1'}));assert.equal(r.status,200);assert.equal((await r.json()).event.notes,'Plain <b>text</b>');
 for(const u of ['https://evil.test/calendar/event','javascript:alert(1)','https://www.google.com@evil.test/calendar/event','https://www.google.com/calendar/event#private']){
  assert.equal((await fixture({response:{...response,event:{...response.event,googleUrl:u}}}).api(req('event',{eventId:'ev1'}))).status,502);
 }
});
test('detail refuses mismatched IDs, uneditable capabilities and unsafe Drive links',async()=>{
 const e={...event(),etag:'"1"',notes:'',timeZone:'UTC',editable:true,editReason:null,googleUrl:null,driveLinks:[]};
 for(const response of [{state:'ready',event:{...e,id:'other'},capabilities:caps},{state:'ready',event:e,capabilities:{read:true,create:false,manageOwn:false}},{state:'ready',event:{...e,driveLinks:[{title:'x',url:'https://evil.test/x',mimeType:'image/png'}]},capabilities:caps}]){
  assert.equal((await fixture({response}).api(req('event',{eventId:'ev1'}))).status,502);
 }
});
test('prepare requires exact draft, UUID and review fields; does not itself commit',async()=>{
 const input={requestId:R,action:'create',draft:draft()};
 const response={state:'review',requestId:R,reviewToken:'a'.repeat(43),expiresAt:'2026-11-07T12:10:00.000Z',action:'create',eventId:null,eventRef:null,draft:draft(),defaults:{visibility:'private',notifications:false,reminders:false}};
 const f=fixture({response}),r=await f.api(req('prepare',input));assert.equal(r.status,200);assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/\/prepare$/);
 for(const v of [{...input,requestId:'other'},{...input,draft:{...draft(),attendees:[]}},{...input,action:'delete'},{...input,action:'update'},{...input,draft:{...draft(),end:draft().start}}])assert.equal((await fixture({response}).api(req('prepare',v))).status,400);
});
test('review rejects hidden notifications, stale expiry or changed update identity',async()=>{
 const response={state:'review',requestId:R,reviewToken:'a'.repeat(43),expiresAt:'2026-11-07T12:10:00.000Z',action:'create',eventId:null,eventRef:null,draft:draft(),defaults:{visibility:'private',notifications:false,reminders:false}};
 for(const value of [{...response,defaults:{...response.defaults,notifications:true}},{...response,expiresAt:'2026-11-07T11:00:00Z'},{...response,requestId:OTHER}])assert.equal((await fixture({response:value}).api(req('prepare',{requestId:R,action:'create',draft:draft()}))).status,502);
});
test('commit forwards once after explicit confirmation and exposes only durable receipt',async()=>{
 const body={requestId:R,reviewToken:'a'.repeat(43),confirm:true},response={state:'completed',requestId:R,eventId:'ev1',eventRef:REF,etag:'"1"',replayed:false,secret:'PRIVATE'};
 const f=fixture({response}),r=await f.api(req('commit',body));assert.equal(r.status,200);assert.equal(f.calls.length,1);assert.equal((await r.text()).includes('PRIVATE'),false);
 assert.equal((await fixture().api(req('commit',{...body,confirm:false}))).status,400);
});
test('ambiguous commit transport/redirect/malformed receipt never retries or reports success',async()=>{
 for(const fetcher of [async()=>{throw Error('PRIVATE');},async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}),async()=>Response.json({state:'completed',requestId:R})]){
  const f=fixture({fetcher}),r=await f.api(req('commit',{requestId:R,reviewToken:'a'.repeat(43),confirm:true}));assert.equal(r.status,504);assert.equal((await r.json()).code,'calendar_write_unconfirmed');assert.equal(f.calls.length,1);
 }
});
test('operation reconciliation retains nonterminal unknown and filters codes',async()=>{
 const response={state:'unknown',requestId:R,eventId:'ev1',eventRef:REF,etag:null,code:'PRIVATE',terminal:false};
 const r=await fixture({response}).api(req('operation',{requestId:R,reconcile:true}));assert.equal(r.status,200);const data=await r.json();assert.equal(data.state,'unknown');assert.equal(data.terminal,false);assert.equal(data.code,'calendar_unavailable');
 assert.equal((await fixture({response:{...response,state:'completed',terminal:true}}).api(req('operation',{requestId:R,reconcile:true}))).status,502);
});
test('fixed errors do not echo provider details',async()=>{
 const f=fixture({status:409,response:{code:'calendar_conflict',error:'PRIVATE',refresh_token:'PRIVATE'}});
 const r=await f.api(req('event',{eventId:'ev1'}));assert.equal(r.status,409);assert.equal((await r.text()).includes('PRIVATE'),false);
 const g=fixture({status:503,response:{code:'__proto__',error:'PRIVATE'}});assert.equal((await g.api(req())).status,503);
});
test('aborted reads clear before runtime or suppress response afterwards',async()=>{
 const c=new AbortController();c.abort();const f=fixture();assert.equal((await f.api(req('range',range,{signal:c.signal}))).status,503);assert.equal(f.calls.length,0);
 const later=new AbortController(),g=fixture({fetcher:async()=>{later.abort();return Response.json(payload());}});const r=await g.api(req('range',range,{signal:later.signal}));assert.equal(r.status,503);assert.equal((await r.text()).includes('Garage'),false);
});
test('oversized request and response are bounded and credentials not echoed',async()=>{
 const f=fixture();assert.equal((await f.api(req('prepare',{private:'x'.repeat(40000)}))).status,413);assert.equal(f.calls.length,0);
 const g=fixture({fetcher:async()=>new Response('x'.repeat(140000),{headers:{'content-type':'application/json'}})});assert.ok((await g.api(req())).status>=500);
});
test('binding derives server eventRef via fixed authenticated runtime and cannot accept a browser ref',async()=>{
 const calls=[],input={accessToken:'synthetic.token',userId:U,origin:O,eventId:'ev1',connectionRevision:4,fetcher:async(url,o)=>{calls.push({url,o});return Response.json({eventRef:REF,eventId:'ev1',connectionRevision:4,private:'PRIVATE'});}};
 assert.deepEqual(await resolveCalendarBinding(input),{eventRef:REF,eventId:'ev1',connectionRevision:4});
 assert.equal(calls[0].url,GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/calendar/context');assert.deepEqual(JSON.parse(calls[0].o.body),{eventId:'ev1'});
 for(const change of [{origin:'https://evil.test'},{eventId:'../x'},{connectionRevision:0},{userId:'other'},{accessToken:'secret token'}])await assert.rejects(()=>resolveCalendarBinding({...input,...change}));
 await assert.rejects(()=>resolveCalendarBinding({...input,fetcher:async()=>Response.json({eventRef:REF,eventId:'other',connectionRevision:4})}));
 await assert.rejects(()=>resolveCalendarBinding({...input,fetcher:async()=>Response.json({eventRef:REF,eventId:'ev1',connectionRevision:5})}));
});
test('binding rejects redirect, permission failures, unbounded and stale replies without leaking details',async()=>{
 const args={accessToken:'synthetic.token',userId:U,origin:O,eventId:'ev1',connectionRevision:4};
 for(const fetcher of [async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}),async()=>Response.json({code:'calendar_scope_required',error:'PRIVATE'},{status:403}),async()=>new Response('PRIVATE'.repeat(2000))]){
  await assert.rejects(()=>resolveCalendarBinding({...args,fetcher}),e=>!e.message.includes('PRIVATE'));
 }
});

test('all-day range respects timezone and exclusive end including DST',async()=>{
 for(const e of [{...event(),allDay:true,start:'2025-11-01',end:'2025-11-02'},{...event(),allDay:true,start:'2026-12-13',end:'2026-12-14'},{...event(),allDay:true,start:'2026-10-31',end:'2026-11-01'}]){
  assert.equal((await fixture({response:{...payload(),events:[e]}}).api(req())).status,502);
 }
 const valid={...event(),allDay:true,start:'2026-12-12',end:'2026-12-13'};
 assert.equal((await fixture({response:{...payload(),events:[valid]}}).api(req())).status,200);
});
test('all post-dispatch nonterminal and broken commit responses preserve uncertainty',async()=>{
 const body={requestId:R,reviewToken:'a'.repeat(43),confirm:true};
 const cases=[async()=>new Response('{broken',{headers:{'content-type':'application/json'}}),async()=>new Response('x'.repeat(140000)),async()=>Response.json({ok:false,code:'calendar_timeout',terminal:false},{status:504}),async()=>Response.json({ok:false,code:'calendar_conflict',terminal:false},{status:409})];
 for(const fetcher of cases){const f=fixture({fetcher}),r=await f.api(req('commit',body));assert.equal(r.status,504);assert.deepEqual(await r.json(),{code:'calendar_write_unconfirmed',error:'The save result is not yet confirmed. Use Check save status before trying another save.',terminal:false});assert.equal(f.calls.length,1);}
 const terminal=fixture({status:409,response:{ok:false,requestId:R,code:'calendar_conflict',terminal:true,error:'PRIVATE'}});
 const r=await terminal.api(req('commit',body));assert.equal(r.status,409);assert.equal((await r.json()).terminal,true);
});
function authResult(scope){
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v]of Object.entries({client_id:'synthetic.apps.googleusercontent.com',redirect_uri:O+'/api/connections/google/callback',response_type:'code',scope,state:'s'.repeat(43),access_type:'offline',include_granted_scopes:'false',prompt:'consent',code_challenge:'p'.repeat(43),code_challenge_method:'S256'}))u.searchParams.set(k,v);
 return {authorizationUrl:u.href,expiresAt:'2026-11-07T12:10:00.000Z'};
}
function startRequest(body){return new Request(O+'/api/connections/google/start',{method:'POST',headers:{origin:O,'content-type':'application/json','x-xtreme-account':U},body:JSON.stringify(body)});}
test('read and manage consent accept only exactly selected scoped permissions',async()=>{
 const read='openid email https://www.googleapis.com/auth/calendar.events.readonly',manage='openid email https://www.googleapis.com/auth/calendar.events.owned';
 assert.equal((await fixture({response:authResult(read)}).legacy.api(startRequest({services:['calendar']}))).status,200);
 assert.equal((await fixture({response:authResult(manage)}).legacy.api(startRequest({services:['calendar'],calendarAccess:'manage'}))).status,200);
 for(const scope of [manage,'openid email https://www.googleapis.com/auth/calendar',read+' https://www.googleapis.com/auth/gmail.modify',read+' profile'])assert.equal((await fixture({response:authResult(scope)}).legacy.api(startRequest({services:['calendar']}))).status,502);
 assert.equal((await fixture({response:authResult(read)}).legacy.api(startRequest({services:['calendar'],calendarAccess:'manage'}))).status,502);
});
test('disconnected or unauthorized connection cannot advertise write capabilities',async()=>{
 const status={state:'connected',configured:true,account:{email:'test@example.test',displayName:'Test'},revision:4,services:[{id:'calendar',authorized:true,enabled:true}],calendarAccess:'manage',calendarCapabilities:caps};
 const get=()=>new Request(O+'/api/connections/google/status',{headers:{'x-xtreme-account':U}});
 assert.equal((await fixture({response:status}).legacy.api(get())).status,200);
 for(const change of [{state:'disconnected'},{services:[{id:'calendar',authorized:false,enabled:false}]},{calendarAccess:'read'},{services:[{id:'calendar',authorized:true,enabled:false}]}])assert.equal((await fixture({response:{...status,...change}}).legacy.api(get())).status,502);
});


// Synthetic output emitted by the real Python controller; never live Calendar data.
// Source: migration-20261107/calendar-workspace-contract-fixtures.json.
const PYTHON_WORKSPACE_WIRE = {
  "synthetic": true,
  "status": {
    "state": "connected",
    "configured": true,
    "account": {
      "email": "person@example.test",
      "displayName": "Person"
    },
    "revision": 1,
    "hasSavedConnection": true,
    "services": [
      {
        "id": "gmail",
        "authorized": false,
        "enabled": false
      },
      {
        "id": "calendar",
        "authorized": true,
        "enabled": true
      },
      {
        "id": "drive",
        "authorized": false,
        "enabled": false
      },
      {
        "id": "docs",
        "authorized": false,
        "enabled": false
      },
      {
        "id": "sheets",
        "authorized": false,
        "enabled": false
      },
      {
        "id": "slides",
        "authorized": false,
        "enabled": false
      },
      {
        "id": "contacts",
        "authorized": false,
        "enabled": false
      },
      {
        "id": "tasks",
        "authorized": false,
        "enabled": false
      }
    ],
    "calendarAccess": "manage",
    "calendarCapabilities": {
      "read": true,
      "create": true,
      "manageOwn": true
    },
    "message": "Calendar read access is enabled. Other Google data actions are not enabled."
  },
  "range": {
    "state": "ready",
    "timeZone": "America/New_York",
    "rangeStart": "2026-11-07T00:00:00.000Z",
    "rangeEnd": "2026-11-14T00:00:00.000Z",
    "events": [
      {
        "id": "ac1150bd57fd9a389e3e9d033df09c537ff0400f5827bf481299fa8a45df7a6d9",
        "title": "Site visit",
        "start": "2026-11-07T13:00:00.000Z",
        "end": "2026-11-07T14:00:00.000Z",
        "allDay": false,
        "location": "Job site",
        "eventRef": "ce1_8f3fb1fed7f3800f2b5c403caac0e3ffe8c1a1a6278c718b78f5ec2fb3636f85"
      },
      {
        "id": "fake_all_day",
        "title": "Synthetic job walk",
        "start": "2026-11-08",
        "end": "2026-11-09",
        "allDay": true,
        "location": "",
        "eventRef": "ce1_a8131d56d72b5def039e025c92d50d94f4b1b9b7eb2def52e2eebbc650a5fc17"
      }
    ],
    "hasMore": false,
    "nextCursor": null,
    "capped": false
  },
  "event": {
    "state": "ready",
    "event": {
      "id": "ac1150bd57fd9a389e3e9d033df09c537ff0400f5827bf481299fa8a45df7a6d9",
      "eventRef": "ce1_8f3fb1fed7f3800f2b5c403caac0e3ffe8c1a1a6278c718b78f5ec2fb3636f85",
      "etag": "\"1\"",
      "title": "Site visit",
      "notes": "Check the new slab.",
      "start": "2026-11-07T13:00:00.000Z",
      "end": "2026-11-07T14:00:00.000Z",
      "allDay": false,
      "timeZone": "America/New_York",
      "location": "Job site",
      "editable": true,
      "editReason": null,
      "googleUrl": null,
      "driveLinks": []
    },
    "capabilities": {
      "read": true,
      "create": true,
      "manageOwn": true
    }
  },
  "context": {
    "eventRef": "ce1_8f3fb1fed7f3800f2b5c403caac0e3ffe8c1a1a6278c718b78f5ec2fb3636f85",
    "eventId": "ac1150bd57fd9a389e3e9d033df09c537ff0400f5827bf481299fa8a45df7a6d9",
    "connectionRevision": 1
  },
  "prepare": {
    "state": "review",
    "requestId": "c7a39810-e74b-4d31-a781-777777777777",
    "reviewToken": "iz-48w5akrYW0b5QeNCCbPkRBVoh-q52KKLGrcjmqms",
    "expiresAt": "2026-11-07T12:10:00.000Z",
    "action": "create",
    "eventId": null,
    "eventRef": null,
    "draft": {
      "title": "Site visit",
      "notes": "Check the new slab.",
      "location": "Job site",
      "start": "2026-11-07T13:00:00.000Z",
      "end": "2026-11-07T14:00:00.000Z",
      "allDay": false,
      "timeZone": "America/New_York"
    },
    "defaults": {
      "visibility": "private",
      "notifications": false,
      "reminders": false
    }
  },
  "commit": {
    "state": "completed",
    "requestId": "c7a39810-e74b-4d31-a781-777777777777",
    "eventId": "ac1150bd57fd9a389e3e9d033df09c537ff0400f5827bf481299fa8a45df7a6d9",
    "eventRef": "ce1_8f3fb1fed7f3800f2b5c403caac0e3ffe8c1a1a6278c718b78f5ec2fb3636f85",
    "etag": "\"1\"",
    "replayed": false
  },
  "operation": {
    "state": "completed",
    "requestId": "c7a39810-e74b-4d31-a781-777777777777",
    "eventId": "ac1150bd57fd9a389e3e9d033df09c537ff0400f5827bf481299fa8a45df7a6d9",
    "eventRef": "ce1_8f3fb1fed7f3800f2b5c403caac0e3ffe8c1a1a6278c718b78f5ec2fb3636f85",
    "etag": "\"1\"",
    "code": null,
    "terminal": true
  }
};
// Exact code/status branches from the phase-one google_calendar_workspace.py.
const PYTHON_WORKSPACE_ERROR_STATUSES = [["invalid_event_id",400],["invalid_request_id",400],["invalid_event_version",400],["invalid_calendar_range",400],["calendar_response_invalid",502],["invalid_calendar_draft",400],["calendar_rate_limited",429],["calendar_disabled",503],["refresh_pending",409],["calendar_manage_required",403],["connection_changed",409],["calendar_event_not_found",404],["invalid_calendar_cursor",400],["invalid_calendar_cursor",409],["calendar_existing_operation",409],["operation_conflict",409],["operation_exists",409],["review_session_changed",409],["review_expired",409],["event_read_only",403],["calendar_conflict",409],["calendar_review_limit",429],["operation_changed",409],["confirmation_required",400],["invalid_review_token",400],["operation_not_found",404],["invalid_review_token",403],["calendar_write_unconfirmed",409],["calendar_write_limit",429],["invalid_operation_request",400],["connection_revision_required",400],["identity_service_unavailable",503],["account_changed",403],["not_found",404]];

test('actual Python workspace wire fixtures pass real BFF range/detail/review/receipt validators',async()=>{
 const w=PYTHON_WORKSPACE_WIRE;
 for(const [action,body,response]of [
  ['range',{rangeStart:w.range.rangeStart,rangeEnd:w.range.rangeEnd},w.range],
  ['event',{eventId:w.event.event.id},w.event],
  ['prepare',{requestId:w.prepare.requestId,action:'create',draft:w.prepare.draft},w.prepare],
  ['commit',{requestId:w.commit.requestId,reviewToken:w.prepare.reviewToken,confirm:true},w.commit],
  ['operation',{requestId:w.operation.requestId,reconcile:true},w.operation]
 ]){
  const f=fixture({response}),r=await f.api(req(action,body));assert.equal(r.status,200,action);assert.deepEqual(await r.json(),response);assert.equal(f.calls.length,1);
 }
 const f=fixture({response:w.status}),r=await f.legacy.api(new Request(O+'/api/connections/google/status',{headers:{'x-xtreme-account':U}}));assert.equal(r.status,200);const status=await r.json();assert.equal(status.calendarAccess,'manage');assert.deepEqual(status.calendarCapabilities,w.status.calendarCapabilities);
 assert.deepEqual(await resolveCalendarBinding({accessToken:'synthetic.token',userId:U,origin:O,eventId:w.context.eventId,connectionRevision:1,fetcher:async()=>Response.json(w.context)}),w.context);
});
test('actual Python phase-one error code/status pairs retain safe actionable messages',async()=>{
 for(const [code,status]of PYTHON_WORKSPACE_ERROR_STATUSES){
  const f=fixture({status,response:{ok:false,code,terminal:false,error:'PRIVATE_PROVIDER_MESSAGE',secret:'PRIVATE_TOKEN'}}),r=await f.api(req());
  assert.equal(r.status,status,code+':'+status);const data=await r.json();assert.equal(data.code,code);assert.equal(JSON.stringify(data).includes('PRIVATE'),false);assert.equal(f.calls.length,1);
 }
});
test('commit terminal claims require exact UUID request identity and recognized code/status',async()=>{
 const body={requestId:R,reviewToken:'a'.repeat(43),confirm:true};
 for(const change of [{requestId:undefined},{requestId:OTHER},{requestId:[R]},{ok:true},{terminal:'true'},{code:'PRIVATE_UNKNOWN'}]){
  const f=fixture({status:409,response:{ok:false,requestId:R,code:'operation_changed',terminal:true,error:'PRIVATE',...change}}),r=await f.api(req('commit',body));
  assert.equal(r.status,504);assert.deepEqual(await r.json(),{code:'calendar_write_unconfirmed',error:'The save result is not yet confirmed. Use Check save status before trying another save.',terminal:false});assert.equal(f.calls.length,1);
 }
 const wrongStatus=fixture({status:503,response:{ok:false,requestId:R,code:'operation_changed',terminal:true}});assert.equal((await wrongStatus.api(req('commit',body))).status,504);
 for(const [code,status]of [['operation_changed',409],['review_expired',409],['invalid_review_token',403]]){
  const f=fixture({status,response:{ok:false,requestId:R,code,terminal:true,error:'PRIVATE'}}),r=await f.api(req('commit',body));assert.equal(r.status,status);const data=await r.json();assert.equal(data.code,code);assert.equal(data.terminal,true);assert.equal(data.requestId,R);assert.equal(JSON.stringify(data).includes('PRIVATE'),false);assert.equal(f.calls.length,1);
 }
});
test('existing-operation recovery survives uncertain commit mapping and stays bound to request',async()=>{
 const response={ok:false,code:'calendar_existing_operation',requestId:R,recoveryRequestId:OTHER,terminal:false,error:'PRIVATE'},prepare={requestId:R,action:'create',draft:draft()},commit={requestId:R,reviewToken:'a'.repeat(43),confirm:true};
 for(const [action,body,status,code]of [['prepare',prepare,409,'calendar_existing_operation'],['commit',commit,504,'calendar_write_unconfirmed']]){
  const f=fixture({response,status:409}),r=await f.api(req(action,body));assert.equal(r.status,status);const data=await r.json();assert.equal(data.code,code);assert.equal(data.recoveryRequestId,OTHER);assert.notEqual(data.terminal,true);assert.equal(JSON.stringify(data).includes('PRIVATE'),false);assert.equal(f.calls.length,1);
 }
 for(const change of [
  {recoveryRequestId:'private-secret'},{recoveryRequestId:[OTHER]},{recoveryRequestId:OTHER.replace('-4222-','-1222-')},
  {recoveryRequestId:null},{requestId:undefined},{requestId:OTHER},{ok:true},{terminal:true},{code:'operation_conflict'}
 ]){
  const f=fixture({status:409,response:{...response,...change}}),r=await f.api(req('commit',commit)),data=await r.json();assert.equal('recoveryRequestId' in data,false);assert.equal(JSON.stringify(data).includes('private-secret'),false);assert.equal(f.calls.length,1);
 }
 const wrongStatus=fixture({status:503,response});assert.equal('recoveryRequestId' in await (await wrongStatus.api(req('commit',commit))).json(),false);
});
test('review tokens are exactly 43 base64url characters and operation IDs are canonical UUIDv4 strings',async()=>{
 const good={...PYTHON_WORKSPACE_WIRE.prepare,requestId:R},create={requestId:R,action:'create',draft:draft()};
 for(const token of ['a'.repeat(20),'a'.repeat(40),'a'.repeat(42),'a'.repeat(44),'a'.repeat(42)+'=', 'a'.repeat(42)+'/', ['a'.repeat(43)]]){
  const f=fixture({response:good});assert.equal((await f.api(req('commit',{requestId:R,reviewToken:token,confirm:true}))).status,400);assert.equal(f.calls.length,0);
  assert.equal((await fixture({response:{...good,reviewToken:token}}).api(req('prepare',create))).status,502);
 }
 for(const requestId of [[R],R.replace('-4111-','-1111-'),'ABCDEF01-1111-4111-8111-111111111111',null]){
  const f=fixture({response:good});assert.equal((await f.api(req('prepare',{...create,requestId}))).status,400);assert.equal(f.calls.length,0);
 }
});
test('create review has no event binding; update review keeps the exact requested event and a non-null ref',async()=>{
 const good={...PYTHON_WORKSPACE_WIRE.prepare,requestId:R},create={requestId:R,action:'create',draft:draft()},update={requestId:R,action:'update',eventId:'ev1',etag:'"1"',draft:draft()};
 for(const change of [{eventId:'ev1'},{eventRef:REF},{eventId:'ev1',eventRef:REF},{eventId:undefined},{eventRef:undefined}]){
  assert.equal((await fixture({response:{...good,...change}}).api(req('prepare',create))).status,502);
 }
 const updated={...good,action:'update',eventId:'ev1',eventRef:REF};
 assert.equal((await fixture({response:updated}).api(req('prepare',update))).status,200);
 for(const change of [{eventId:'other'},{eventId:null},{eventRef:null},{eventRef:[REF]},{eventRef:'ce1_bad'},{action:'create'}]){
  assert.equal((await fixture({response:{...updated,...change}}).api(req('prepare',update))).status,502);
 }
});

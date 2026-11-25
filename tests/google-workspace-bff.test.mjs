import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleWorkspaceHandlers,GOOGLE_APP_ORIGINS,GOOGLE_RUNTIME_ORIGIN} from '../server/google-workspace-proxy.mjs';
const O=GOOGLE_APP_ORIGINS[0],UID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const NOW=1794067200000,STATE='s'.repeat(43);
const connected=()=>({state:'connected',configured:true,account:{email:'member@example.test',displayName:'Member'},revision:1,services:[{id:'gmail',authorized:true,enabled:false}],providerRevoked:false});
function authorize(origin=O){
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v]of Object.entries({client_id:'test.apps.googleusercontent.com',redirect_uri:origin+'/api/connections/google/callback',response_type:'code',scope:'openid email https://mail.google.com/',state:STATE,access_type:'offline',include_granted_scopes:'false',prompt:'consent select_account',code_challenge:'c'.repeat(43),code_challenge_method:'S256'}))u.searchParams.set(k,v);
 return {authorizationUrl:u.href,expiresAt:new Date(NOW+600000).toISOString()};
}
function fixture({user={id:UID,email_confirmed_at:'confirmed',is_anonymous:false},sessionId=UID,response=connected(),status=200,fetcher}={}){
 const calls=[],order=[];
 const authClient=async()=>({auth:{
  getUser:async()=>{order.push('getUser');return {data:{user},error:null};},
  getSession:async()=>{order.push('getSession');return {data:{session:{user:{id:sessionId},access_token:'test.access.token'}},error:null};}
 }});
 const handlers=createGoogleWorkspaceHandlers({authClient,now:()=>NOW,fetcher:async(url,options)=>{calls.push({url,options});return fetcher?fetcher(url,options):Response.json(response,{status});}});
 return {...handlers,calls,order};
}
function request(action='status',body,options={}){
 const origin=options.appOrigin||O,method=options.method||(body===undefined?'GET':'POST');
 return new Request(origin+'/api/connections/google/'+action+(options.query||''),{method,headers:{'x-xtreme-account':UID,...(method==='POST'?{origin,'content-type':'application/json'}:{}),...(options.headers||{})},body:method==='GET'?undefined:typeof body==='string'?body:JSON.stringify(body)});
}
function callbackQuery(values={state:STATE,code:'4/fake-authorization-code'},origin=O){
 const url=new URL(origin+'/api/connections/google/callback');for(const [key,value]of Object.entries(values))url.searchParams.set(key,value);return new Request(url,{headers:{'sec-fetch-site':'cross-site'}});
}
test('status verifies user before session and forwards only fixed authenticated runtime request',async()=>{
 const f=fixture(),r=await f.api(request());assert.equal(r.status,200);
 assert.deepEqual(f.order,['getUser','getSession']);assert.equal(f.calls.length,1);
 const {url,options}=f.calls[0];assert.equal(url,GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/status');assert.equal(options.method,'POST');
 assert.equal(options.redirect,'manual');assert.equal(options.headers.authorization,'Bearer test.access.token');assert.equal(options.headers['x-xtreme-account'],UID);assert.equal(options.headers.origin,O);assert.equal(options.body,'{}');
 assert.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});
test('missing/unconfirmed/anonymous authentication cannot retrieve session or reach runtime',async()=>{
 for(const user of [null,{id:UID,is_anonymous:false},{id:UID,email_confirmed_at:'yes',is_anonymous:true}]){
  const f=fixture({user}),r=await f.api(request());assert.equal(r.status,401);assert.deepEqual(f.order,['getUser']);assert.equal(f.calls.length,0);
 }
});
test('account switch and missing owner fence fail closed',async()=>{
 for(const header of [OTHER,'']){
  const f=fixture(),r=await f.api(request('status',undefined,{headers:{'x-xtreme-account':header}}));assert.equal(r.status,409);assert.equal(f.calls.length,0);
 }
 const f=fixture({sessionId:OTHER});assert.equal((await f.api(request())).status,401);assert.equal(f.calls.length,0);
});
test('API accepts only exact app origins and same-origin mutation',async()=>{
 for(const options of [{appOrigin:'https://evil.example.test'},{headers:{origin:'https://evil.example.test'}},{headers:{origin:'null'}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{origin:''}}]){
  const f=fixture();assert.equal((await f.api(request('start',{services:['gmail']},options))).status,403);assert.equal(f.calls.length,0);
 }
 for(const origin of GOOGLE_APP_ORIGINS){
  const f=fixture({response:authorize(origin)});assert.equal((await f.api(request('start',{services:['gmail']},{appOrigin:origin}))).status,200);assert.equal(f.calls[0].options.headers.origin,origin);
 }
});
test('public complete endpoint, unsupported paths, query parameters and methods never dispatch',async()=>{
 for(const [action,body,options,status]of [['complete',{state:STATE,code:'fake'}, {},404],['other',undefined,{},404],['status',undefined,{query:'?url=https://evil.test'},404],['status',{}, {},405],['start',undefined,{},405]]){
  const f=fixture();assert.equal((await f.api(request(action,body,options))).status,status);assert.equal(f.calls.length,0);
 }
});
test('start validates selected services; no arbitrary arguments reach runtime',async()=>{
 for(const body of [{services:[]},{services:['gmail','gmail']},{services:['unknown']},{services:['gmail'],url:'https://evil.test'},{services:'gmail'}]){
  const f=fixture();assert.equal((await f.api(request('start',body))).status,400);assert.equal(f.calls.length,0);
 }
 const scoped=authorize(),authUrl=new URL(scoped.authorizationUrl);authUrl.searchParams.set('scope',authUrl.searchParams.get('scope')+' https://www.googleapis.com/auth/calendar');
 const f=fixture({response:{...scoped,authorizationUrl:authUrl.href}});assert.equal((await f.api(request('start',{services:['gmail','calendar']}))).status,200);assert.deepEqual(JSON.parse(f.calls[0].options.body),{services:['gmail','calendar']});
});
test('request content type, malformed JSON and actual streamed body bounds are enforced',async()=>{
 for(const [body,headers,status]of [['{}',{'content-type':'text/plain'},415],['{',{},400],[' '.repeat(8193),{'content-length':'1'},413]]){
  const f=fixture();assert.equal((await f.api(request('start',body,{headers}))).status,status);assert.equal(f.calls.length,0);
 }
});
test('status response strips provider credentials and arbitrary messages',async()=>{
 const f=fixture({response:{...connected(),access_token:'secret-access',refresh_token:'secret-refresh',message:'secret-provider-message',account:{...connected().account,token:'secret-account'}}});
 const r=await f.api(request()),raw=await r.text();assert.equal(r.status,200);assert.equal(raw.includes('secret-'),false);assert.equal(JSON.parse(raw).services[0].enabled,false);
});
test('malformed/oversized upstream results fail safely',async()=>{
 for(const response of [{...connected(),services:[{id:'bad',authorized:true,enabled:false}]},{...connected(),account:{email:'x',displayName:'bad\nname'}},{...connected(),revision:-1}]){
  const f=fixture({response});assert.equal((await f.api(request())).status,502);
 }
 const f=fixture({fetcher:async()=>new Response('x'.repeat(65537))});assert.equal((await f.api(request())).status,502);
});
test('authorization URL must target exact Google endpoint, callback and PKCE; credentials cannot escape',async()=>{
 const good=authorize();
 for(const mutate of [
  u=>{u.hostname='evil.test';},u=>{u.pathname='/other';},u=>{u.searchParams.set('redirect_uri','https://evil.test/callback');},
  u=>{u.searchParams.set('client_secret','secret');},u=>{u.searchParams.delete('code_challenge');},u=>{u.searchParams.set('include_granted_scopes','true');},u=>{u.searchParams.append('state',STATE);}
 ]){
  const u=new URL(good.authorizationUrl);mutate(u);const f=fixture({response:{...good,authorizationUrl:u.href}});
  const r=await f.api(request('start',{services:['gmail']}));assert.equal(r.status,502);assert.equal((await r.text()).includes('secret'),false);
 }
 const f=fixture({response:{...good,expiresAt:new Date(NOW-1).toISOString()}});assert.equal((await f.api(request('start',{services:['gmail']}))).status,502);
});
test('runtime errors and redirect details are never exposed',async()=>{
 for(const status of [400,401,403,409,429,500,503]){
  const f=fixture({response:{reason:'secret-provider-details',access_token:'secret-token'},status});const r=await f.api(request());assert.equal((await r.text()).includes('secret'),false);assert.equal(f.calls.length,1);
 }
 const f=fixture({fetcher:async()=>new Response(null,{status:302,headers:{location:'https://evil.test/?secret=token'}})});
 const r=await f.api(request());assert.equal(r.status,502);assert.equal(r.headers.get('location'),null);
});
test('disconnect requires explicit current revision and returns local-forget semantics',async()=>{
 for(const body of [{confirm:false,revision:1},{confirm:true,revision:0},{confirm:true,revision:1,revokeGoogle:true}]){
  const f=fixture();assert.equal((await f.api(request('disconnect',body))).status,400);assert.equal(f.calls.length,0);
 }
 const f=fixture({response:{...connected(),state:'disconnected',account:null,providerRevoked:false}});
 const r=await f.api(request('disconnect',{confirm:true,revision:1}));assert.equal(r.status,200);assert.equal((await r.json()).providerRevoked,false);
 assert.equal(f.calls[0].url,GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/disconnect');
});
test('callback uses current verified session, completes server-side and only redirects to fixed app route',async()=>{
 const f=fixture(),r=await f.callback(callbackQuery({state:STATE,code:'4/fake',return_to:'https://evil.test',scope:'ignored'}));
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),O+'/?google=connected#connections');
 assert.deepEqual(f.order,['getUser','getSession']);assert.equal(f.calls[0].url,GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/complete');
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{state:STATE,code:'4/fake'});assert.equal(f.calls[0].options.headers['x-xtreme-account'],UID);
 assert.equal((await r.text()).includes(STATE),false);
});
test('callback cancellation is consumed without a raw Google error or forced account change',async()=>{
 const f=fixture(),r=await f.callback(callbackQuery({state:STATE,error:'access_denied',error_description:'secret-provider-error'}));
 assert.equal(r.headers.get('location'),O+'/?google=cancelled#connections');
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{state:STATE,error:'access_denied'});
});
test('callback missing login requests safe reconnect; malformed or stale state does not leak details',async()=>{
 const f=fixture({user:null}),r=await f.callback(callbackQuery());assert.equal(r.headers.get('location'),O+'/?google=reconnect#connections');assert.equal(f.calls.length,0);
 for(const query of [{state:'bad',code:'fake'},{state:STATE,code:'fake',error:'access_denied'},{state:STATE,error:'secret-error'},{state:STATE,code:'bad\ncode'}]){
  const f=fixture(),r=await f.callback(callbackQuery(query));assert.equal(r.headers.get('location'),O+'/?google=error#connections');assert.equal(f.calls.length,0);
 }
 const denied=fixture({status:409,response:{reason:'secret-account-state-mismatch'}}),result=await denied.callback(callbackQuery());
 assert.equal(result.headers.get('location'),O+'/?google=error#connections');assert.equal((await result.text()).includes('secret'),false);
});
test('callback rejects unknown host and duplicate state before runtime dispatch',async()=>{
 const f=fixture(),badHost=await f.callback(callbackQuery(undefined,'https://evil.test'));assert.equal(badHost.status,403);assert.equal(badHost.headers.get('location'),null);
 const url=new URL(callbackQuery().url);url.searchParams.append('state',STATE);const r=await f.callback(new Request(url));
 assert.equal(r.headers.get('location'),O+'/?google=error#connections');assert.equal(f.calls.length,0);
});

test('malformed UTF-8 is rejected rather than silently rewritten',async()=>{
 const f=fixture(),invalidRequest=new Request(O+'/api/connections/google/start',{method:'POST',headers:{origin:O,'x-xtreme-account':UID,'content-type':'application/json'},body:new Uint8Array([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d])});
 assert.equal((await f.api(invalidRequest)).status,400);assert.equal(f.calls.length,0);
 const g=fixture({fetcher:async()=>new Response(new Uint8Array([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d]))});
 assert.equal((await g.api(request())).status,502);
});

test('fresh setup without a stored grant accepts revision zero and saved=false',async()=>{
 const f=fixture({response:{state:'setup_required',configured:false,account:null,revision:0,services:[],hasSavedConnection:false}});
 const r=await f.api(request());assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.revision,0);assert.equal(data.hasSavedConnection,false);assert.equal(data.account,null);
});
test('missing Google configuration preserves saved-grant metadata and allows local-only forget',async()=>{
 const saved={state:'setup_required',configured:false,account:null,revision:4,services:[],hasSavedConnection:true};
 const f=fixture({response:saved}),r=await f.api(request());assert.equal(r.status,200);
 const data=await r.json();assert.equal(data.hasSavedConnection,true);assert.equal(data.account,null);assert.equal(data.revision,4);
 const g=fixture({response:{...saved,state:'disconnected',revision:5,hasSavedConnection:false,providerRevoked:false}});
 const removed=await g.api(request('disconnect',{confirm:true,revision:4}));assert.equal(removed.status,200);
 const result=await removed.json();assert.equal(result.hasSavedConnection,false);assert.equal(result.providerRevoked,false);
 assert.deepEqual(JSON.parse(g.calls[0].options.body),{confirm:true,revision:4});
 assert.equal(g.calls[0].url,GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/disconnect');
});
test('saved-grant metadata must be boolean and saved or connected states require a positive revision',async()=>{
 for(const response of [
  {state:'setup_required',configured:false,account:null,revision:1,services:[],hasSavedConnection:'true'},
  {state:'setup_required',configured:false,account:null,revision:0,services:[],hasSavedConnection:true},
  {state:'unavailable',configured:false,account:null,revision:null,services:[],hasSavedConnection:true},
  {...connected(),revision:0,hasSavedConnection:true}
 ]){
  const f=fixture({response});assert.equal((await f.api(request())).status,502);
 }
});


test('canonical production domain uses exact Google OAuth callback and same-origin completion', async () => {
 const origin='https://www.xtremeavatar.com';
 assert.ok(GOOGLE_APP_ORIGINS.includes(origin));
 const f=fixture({response:authorize(origin)});
 const response=await f.api(request('start',{services:['gmail']},{appOrigin:origin}));
 assert.equal(response.status,200);
 const approval=new URL((await response.json()).authorizationUrl);
 assert.equal(approval.searchParams.get('redirect_uri'),origin+'/api/connections/google/callback');
 assert.equal(f.calls[0].options.headers.origin,origin);
 const g=fixture(),callbackResponse=await g.callback(callbackQuery(undefined,origin));
 assert.equal(callbackResponse.status,303);
 assert.equal(callbackResponse.headers.get('location'),origin+'/?google=connected#connections');
 assert.equal(g.calls[0].options.headers.origin,origin);
});

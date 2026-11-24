// Google Workspace BFF. Google credentials and grants stay in the existing
// Railway runtime; this module handles only verified app-session forwarding.
export const GOOGLE_RUNTIME_ORIGIN='https://eden-outbound-call-sandbox-code.up.railway.app';
export const GOOGLE_APP_ORIGINS=Object.freeze([
 'https://www.xtremeavatar.com',
 'https://xtreme-avatar-git-migration-vercel-supabase-xtreme-ai-systems.vercel.app',
 'https://xtreme-avatar-2t5t65mxr-xtreme-ai-systems.vercel.app',
 'https://xtreme-avatar-git-migration-ver-dd2679-strategic-minds-advisory.vercel.app'
]);
const SERVICES=Object.freeze(['gmail','calendar','drive','docs','sheets','slides','contacts','tasks']);
const API='/api/connections/google/',CALLBACK=API+'callback';
const STATES=new Set(['setup_required','disconnected','connected','reconnect_required','unavailable']);
const AUTHORIZE_KEYS=new Set(['client_id','redirect_uri','response_type','scope','state','access_type','include_granted_scopes','prompt','code_challenge','code_challenge_method']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE=/^[A-Za-z0-9_-]{20,512}$/;
const safeText=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/u.test(v);
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const MESSAGES={
 calendar_disabled:'Calendar viewing is not enabled yet.',
 google_connection_required:'Connect your Google account before viewing Calendar.',
 calendar_scope_required:'Reconnect Google and approve Calendar read access.',
 connection_revision_required:'Refresh your Google connection before viewing Calendar.',
 calendar_rate_limited:'Please wait before refreshing Calendar again.',
 calendar_reconnect_required:'Reconnect your Google account to view Calendar.',
 calendar_unavailable:'Calendar is temporarily unavailable. Please try again.',
 calendar_api_disabled:'Google Calendar API needs to be enabled by the app administrator.',
 calendar_response_invalid:'Calendar returned an unreadable result. Please try again.',
 calendar_timeout:'Calendar took too long to respond. Please try again.',
 setup_required:'Google Workspace connection needs setup.',
 identity_service_unavailable:'Your account access could not be verified. Please try again.',
 connection_configuration_changed:'Google connection settings changed. Refresh its status.',
 refresh_pending:'Your Google connection is refreshing. Please try again shortly.',
 refresh_unconfirmed:'Your Google connection could not be refreshed. Check its status.',
 reconnect_required:'Reconnect your Google account to continue.',
 sign_in_required:'Sign in to Xtreme Avatar to connect your own Google account.',
 account_changed:'Your signed-in account changed. Reload before connecting.',
 invalid_origin:'Open Xtreme Avatar directly to continue.',
 invalid_request:'This connection request is not valid. Please try again.',
 invalid_content_type:'Send a JSON request.',
 body_too_large:'This connection request is too large.',
 connection_changed:'Your Google connection changed. Refresh before trying again.',
 access_required:'Your account does not have access to this connection.',
 rate_limited:'Please wait a moment before trying again.',
 service_unavailable:'Google Workspace connection is temporarily unavailable.',
 not_found:'This connection route was not found.',
 method_not_allowed:'This method is not supported.'
};
function privateHeaders(extra={}){
 return {'cache-control':'private, no-store, max-age=0','pragma':'no-cache','expires':'0','vary':'Cookie','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...extra};
}
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:privateHeaders({'content-type':'application/json; charset=utf-8'})});}
function errorResponse(error){
 const code=Object.hasOwn(MESSAGES,error?.code)?error.code:'service_unavailable';
 return json({code,error:MESSAGES[code]},Number.isInteger(error?.status)?error.status:503);
}
async function boundedJson(message,maxBytes,request=false){
 if(request&&!message.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'invalid_content_type');
 const declared=Number(message.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>maxBytes)fail(request?413:502,request?'body_too_large':'service_unavailable');
 const reader=message.body?.getReader();if(!reader)fail(request?400:502,request?'invalid_request':'service_unavailable');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();fail(request?413:502,request?'body_too_large':'service_unavailable');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(request?400:502,request?'invalid_request':'service_unavailable');}
}
function appOrigin(request,mutation=false){
 const url=new URL(request.url);
 if(!GOOGLE_APP_ORIGINS.includes(url.origin))fail(403,'invalid_origin');
 const origin=request.headers.get('origin');
 if((mutation&&origin!==url.origin)||(origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')fail(403,'invalid_origin');
 return url.origin;
}
async function appSession(authClient){
 const client=await authClient();
 // getSession is deliberately never called until getUser verified this cookie.
 const verified=await client.auth.getUser(),user=verified?.data?.user;
 if(verified?.error||!UUID.test(user?.id||'')||!user?.email_confirmed_at||user.is_anonymous===true)fail(401,'sign_in_required');
 const session=await client.auth.getSession(),data=session?.data?.session;
 if(session?.error||data?.user?.id!==user.id||typeof data?.access_token!=='string'||!data.access_token||data.access_token.length>16384||/[\s]/u.test(data.access_token))fail(401,'sign_in_required');
 return {id:user.id,token:data.access_token};
}
function validateInput(action,input){
 if(action==='start'){
  if(!(shape(input,['services'])||shape(input,['services','calendarAccess']))||(Object.hasOwn(input,'calendarAccess')&&(input.calendarAccess!=='manage'||!input.services?.includes('calendar')))||!Array.isArray(input.services)||input.services.length<1||input.services.length>SERVICES.length||new Set(input.services).size!==input.services.length||!input.services.every(id=>SERVICES.includes(id)))fail(400,'invalid_request');
  return {services:[...input.services],...(input.calendarAccess==='manage'?{calendarAccess:'manage'}:{})};
 }
 if(!shape(input,['confirm','revision'])||input.confirm!==true||!Number.isSafeInteger(input.revision)||input.revision<1)fail(400,'invalid_request');
 return {confirm:true,revision:input.revision};
}
function statusResult(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||!STATES.has(data.state)||typeof data.configured!=='boolean'||!(data.revision===null||(Number.isSafeInteger(data.revision)&&data.revision>=0))||!Array.isArray(data.services)||data.services.length>SERVICES.length)fail(502,'service_unavailable');
 if(data.account!==null&&(!data.account||!safeText(data.account.email,254)||!safeText(data.account.displayName,160)))fail(502,'service_unavailable');
 if(Object.hasOwn(data,'hasSavedConnection')&&typeof data.hasSavedConnection!=='boolean')fail(502,'service_unavailable');
 if(data.hasSavedConnection===true&&(!Number.isSafeInteger(data.revision)||data.revision<1))fail(502,'service_unavailable');
 const seen=new Set();
 const services=data.services.map(service=>{
  if(!service||!SERVICES.includes(service.id)||seen.has(service.id)||typeof service.authorized!=='boolean'||typeof service.enabled!=='boolean')fail(502,'service_unavailable');
  seen.add(service.id);return {id:service.id,authorized:service.authorized,enabled:service.authorized&&service.enabled};
 });
 if(data.state==='connected'&&(!data.configured||!data.account||!Number.isSafeInteger(data.revision)||data.revision<1))fail(502,'service_unavailable');
 let calendarFields={};
 if(Object.hasOwn(data,'calendarAccess')||Object.hasOwn(data,'calendarCapabilities')){
  const c=data.calendarCapabilities;if(!['read','manage'].includes(data.calendarAccess)||!shape(c,['read','create','manageOwn'])||Object.values(c).some(v=>typeof v!=='boolean')||((c.create||c.manageOwn)&&(!c.read||data.calendarAccess!=='manage')))fail(502,'service_unavailable');
  const calendar=services.find(x=>x.id==='calendar');if((c.read||c.create||c.manageOwn)&&(data.state!=='connected'||!calendar?.authorized||!calendar?.enabled))fail(502,'service_unavailable');
  calendarFields={calendarAccess:data.calendarAccess,calendarCapabilities:{read:c.read,create:c.create,manageOwn:c.manageOwn}};
 }
 const messages={setup_required:'Google Workspace connection needs setup.',disconnected:'Your Google account is not connected.',connected:'Full read/write Google Workspace permissions are connected to your account.',reconnect_required:'Reconnect your Google account to continue.',unavailable:'Google Workspace connection is temporarily unavailable.'};
 return {...calendarFields,state:data.state,configured:data.configured,account:data.account?{email:data.account.email,displayName:data.account.displayName}:null,revision:data.revision,services,message:messages[data.state],...(typeof data.hasSavedConnection==='boolean'?{hasSavedConnection:data.hasSavedConnection}:{}),...(data.providerRevoked===false?{providerRevoked:false}:{})};
}
function startResult(data,origin,now,input){
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.authorizationUrl!=='string'||data.authorizationUrl.length>12000||typeof data.expiresAt!=='string'||data.expiresAt.length>40)fail(502,'service_unavailable');
 let url;try{url=new URL(data.authorizationUrl);}catch{fail(502,'service_unavailable');}
 if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.username||url.password||url.hash)fail(502,'service_unavailable');
 const keys=[...url.searchParams.keys()];
 if(keys.some(key=>!AUTHORIZE_KEYS.has(key))||new Set(keys).size!==keys.length||url.searchParams.get('redirect_uri')!==origin+CALLBACK||url.searchParams.get('response_type')!=='code'||!STATE.test(url.searchParams.get('state')||'')||url.searchParams.get('access_type')!=='offline'||url.searchParams.get('include_granted_scopes')!=='false'||url.searchParams.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge')||'')||!safeText(url.searchParams.get('client_id'),300)||!url.searchParams.get('client_id')||!url.searchParams.get('scope'))fail(502,'service_unavailable');
 const scopes={
  gmail:'https://mail.google.com/',
  calendar:'https://www.googleapis.com/auth/calendar',
  drive:'https://www.googleapis.com/auth/drive',
  docs:'https://www.googleapis.com/auth/documents',
  sheets:'https://www.googleapis.com/auth/spreadsheets',
  slides:'https://www.googleapis.com/auth/presentations',
  contacts:'https://www.googleapis.com/auth/contacts',
  tasks:'https://www.googleapis.com/auth/tasks'
 };
 const expected=['openid','email',...(input?.services||[]).map(id=>scopes[id])].sort();
 const actual=(url.searchParams.get('scope')||'').split(' ').sort();
 if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i]))fail(502,'service_unavailable');
 const expiry=Date.parse(data.expiresAt);if(!Number.isFinite(expiry)||expiry<=now||expiry>now+15*60*1000)fail(502,'service_unavailable');
 return {authorizationUrl:url.href,expiresAt:data.expiresAt};
}
const CALENDAR_ERRORS=Object.freeze({
 calendar_disabled:[503],google_connection_required:[409],calendar_scope_required:[403],
 connection_changed:[409],connection_revision_required:[400],calendar_rate_limited:[429],
 calendar_reconnect_required:[409],calendar_unavailable:[503],calendar_api_disabled:[503],calendar_response_invalid:[502],
 calendar_timeout:[504],setup_required:[503],identity_service_unavailable:[503],
 connection_configuration_changed:[503],refresh_pending:[409],refresh_unconfirmed:[503],
 reconnect_required:[409,503],account_changed:[403,409]
});
function calendarRequest(request){
 // This read has no caller-selected URL, calendar, dates, body or identity channel.
 for(const key of request.headers.keys()){
  if(['authorization','apikey','x-api-key','x-user-id','x-organization-id','x-supabase-user-id'].includes(key)||
   key.startsWith('oai-authenticated-')||key.startsWith('x-oai-')||
   (key.startsWith('x-xtreme-')&&!['x-xtreme-account','x-xtreme-connection-revision'].includes(key)))fail(400,'invalid_request');
 }
 if(request.body||request.headers.has('transfer-encoding')||(request.headers.has('content-length')&&request.headers.get('content-length')!=='0'))fail(400,'invalid_request');
 const revision=request.headers.get('x-xtreme-connection-revision');
 if(!/^[1-9][0-9]{0,15}$/.test(revision||'')||!Number.isSafeInteger(Number(revision)))fail(400,'connection_revision_required');
 return revision;
}
function utcInstant(value){
 if(typeof value!=='string')return null;
 const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
 if(!match)return null;
 const normalized=match[1]+'.'+(match[2]||'').padEnd(3,'0')+'Z',instant=Date.parse(normalized);
 return Number.isFinite(instant)&&new Date(instant).toISOString()===normalized?instant:null;
}
function dateOnly(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 return utcInstant(value+'T00:00:00Z');
}
function calendarText(value,max){
 if(typeof value!=='string'||value.length>max)fail(502,'calendar_response_invalid');
 // Data stays plain text. Never relay provider links, descriptions or markup.
 return value.replace(/<[^>]*>/gu,'').replace(/(?:https?:\/\/|www\.)[^\s<>"']*/giu,'')
  .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu,' ').trim();
}
function calendarResult(data,now){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.state!=='ready'||
  typeof data.timeZone!=='string'||!/^[\x21-\x7e]{1,100}$/.test(data.timeZone)||
  !Array.isArray(data.events)||data.events.length>25||typeof data.hasMore!=='boolean')fail(502,'calendar_response_invalid');
 let dates;
 try{dates=new Intl.DateTimeFormat('en',{timeZone:data.timeZone,year:'numeric',month:'2-digit',day:'2-digit'});}catch{fail(502,'calendar_response_invalid');}
 const start=utcInstant(data.rangeStart),end=utcInstant(data.rangeEnd);
 if(start===null||end===null||end-start!==7*86400000||start>now+60000||start<now-5*60000)fail(502,'calendar_response_invalid');
 const localDate=instant=>{const parts=Object.fromEntries(dates.formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;};
 const firstDay=localDate(start),lastDay=localDate(end),seen=new Set();
 const events=data.events.map(event=>{
  if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.id!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(event.id)||seen.has(event.id)||typeof event.allDay!=='boolean')fail(502,'calendar_response_invalid');
  seen.add(event.id);
  const a=event.allDay?dateOnly(event.start):utcInstant(event.start),b=event.allDay?dateOnly(event.end):utcInstant(event.end);
  if(a===null||b===null||b<=a)fail(502,'calendar_response_invalid');
  if(event.allDay?(event.end<=firstDay||event.start>lastDay):(b<=start||a>=end))fail(502,'calendar_response_invalid');
  return {id:event.id,title:calendarText(event.title,200)||'Untitled appointment',start:event.start,end:event.end,allDay:event.allDay,location:calendarText(event.location,300)};
 });
 return {state:'ready',timeZone:data.timeZone,rangeStart:data.rangeStart,rangeEnd:data.rangeEnd,events,hasMore:data.hasMore};
}
export function createGoogleWorkspaceHandlers({authClient,fetcher=fetch,now=Date.now}){
 if(typeof authClient!=='function')throw new Error('Server authentication required');
 async function runtime(action,payload,session,origin,revision,abortSignal){
  let response;
  const deadline=AbortSignal.timeout(['status','complete','calendar'].includes(action)?70000:40000);
  const signal=action==='calendar'&&abortSignal?AbortSignal.any([deadline,abortSignal]):deadline;
  try{response=await fetcher(GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/'+action,{
   method:'POST',redirect:'manual',cache:'no-store',signal,
   headers:{'content-type':'application/json','accept':'application/json','authorization':'Bearer '+session.token,'origin':origin,'x-xtreme-account':session.id,...(action==='calendar'?{'x-xtreme-connection-revision':revision}:{})},body:JSON.stringify(payload)
  });}catch{fail(503,'service_unavailable');}
  if(response.status>=300&&response.status<400)fail(502,'service_unavailable');
  if(!response.ok){
   if(action==='calendar'){
    let problem;
    try{problem=await boundedJson(response,8192);}catch{fail(503,'calendar_unavailable');}
    const allowed=problem&&typeof problem==='object'&&!Array.isArray(problem)&&typeof problem.code==='string'&&Object.hasOwn(CALENDAR_ERRORS,problem.code)&&CALENDAR_ERRORS[problem.code];
    if(Array.isArray(allowed)&&allowed.includes(response.status))fail(response.status,problem.code);
   }
   // Provider messages, raw tokens, authorization codes and request state are never relayed.
   try{await response.body?.cancel();}catch{}
   if(response.status===401)fail(401,'sign_in_required');
   if(response.status===403)fail(403,'access_required');
   if(response.status===409)fail(409,'connection_changed');
   if(response.status===429)fail(429,'rate_limited');
   if(response.status===400)fail(400,'invalid_request');
   fail(503,'service_unavailable');
  }
  if(action==='calendar'&&response.status!==200)fail(502,'calendar_response_invalid');
  return boundedJson(response,65536);
 }
 async function api(request){
  try{
   const url=new URL(request.url),action=url.pathname.slice(API.length);
   if(!url.pathname.startsWith(API)||!['status','start','disconnect','calendar'].includes(action)||url.search)fail(404,'not_found');
   if(request.method!==(['status','calendar'].includes(action)?'GET':'POST'))fail(405,'method_not_allowed');
   const origin=appOrigin(request,request.method==='POST');
   const session=await appSession(authClient);
   if(request.headers.get('x-xtreme-account')!==session.id)fail(409,'account_changed');
   const revision=action==='calendar'?calendarRequest(request):undefined;
   if(action==='calendar'&&request.signal.aborted)fail(503,'calendar_unavailable');
   const input=['status','calendar'].includes(action)?{}:validateInput(action,await boundedJson(request,8192,true));
   const data=await runtime(action,input,session,origin,revision,request.signal);
   if(action==='calendar'&&request.signal.aborted)fail(503,'calendar_unavailable');
   return json(action==='calendar'?calendarResult(data,now()):action==='start'?startResult(data,origin,now(),input):statusResult(data));
  }catch(error){return errorResponse(error);}
 }
 async function callback(request){
  let origin;
  try{
   const url=new URL(request.url);
   // Google's top-level redirect is cross-site; same-origin POST rules do not
   // apply here. Runtime validates single-use state + verified session binding.
   if(!GOOGLE_APP_ORIGINS.includes(url.origin))fail(403,'invalid_origin');
   origin=url.origin;
   if(request.method!=='GET'||url.pathname!==CALLBACK)fail(405,'method_not_allowed');
   if(url.search.length>8192)fail(400,'invalid_request');
   const params=url.searchParams,state=params.get('state'),code=params.get('code'),error=params.get('error');
   if(params.getAll('state').length!==1||!STATE.test(state||'')||params.getAll('code').length>1||params.getAll('error').length>1||((code!==null)===(error!==null)))fail(400,'invalid_request');
   if(code!==null&&(!safeText(code,4096)||!code||/\s/u.test(code)))fail(400,'invalid_request');
   if(error!==null&&error!=='access_denied')fail(400,'invalid_request');
   const session=await appSession(authClient);
   const payload=error?{state,error:'access_denied'}:{state,code};
   const data=statusResult(await runtime('complete',payload,session,origin));
   const outcome=error?'cancelled':data.state==='connected'?'connected':data.state==='reconnect_required'?'reconnect':'error';
   return new Response(null,{status:303,headers:privateHeaders({location:origin+'/?google='+outcome+'#connections'})});
  }catch(error){
   if(!origin)return errorResponse(error);
   const outcome=error?.code==='sign_in_required'?'reconnect':'error';
   return new Response(null,{status:303,headers:privateHeaders({location:origin+'/?google='+outcome+'#connections'})});
  }
 }
 return {api,callback};
}
// Shared server-side trust boundary for the scoped Calendar workspace.
export {appOrigin,appSession,boundedJson,privateHeaders,utcInstant,dateOnly};

// Verified-cookie BFF for the bounded Google Calendar workspace.
// The original next-seven-days reader remains unchanged.
import {GOOGLE_APP_ORIGINS,GOOGLE_RUNTIME_ORIGIN,appOrigin,appSession,boundedJson,privateHeaders,utcInstant,dateOnly} from './google-workspace-proxy.mjs';
const API='/api/connections/google/calendar/';
const ACTIONS=new Set(['range','event','prepare','commit','operation']);
const ID=/^[A-Za-z0-9_-]{1,256}$/,REF=/^ce1_[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuid=v=>typeof v==='string'&&UUID.test(v);
const reviewToken=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const shape=(v,keys)=>plain(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=(v,max,multiline=false)=>typeof v==='string'&&v.length<=max&&!(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v);
const M={
 invalid_request:[400,'Check the appointment details and try again.'],invalid_content_type:[415,'Send a JSON request.'],body_too_large:[413,'This calendar request is too large.'],
 invalid_origin:[403,'Open Xtreme Avatar directly to continue.'],sign_in_required:[401,'Sign in to Xtreme Avatar to use your calendar.'],
 account_changed:[409,'Your signed-in account changed. Reload before continuing.'],access_required:[403,'Your account no longer has access.'],
 connection_revision_required:[400,'Refresh your Google connection before continuing.'],connection_changed:[409,'Your Google account changed. Refresh before continuing.'],
 google_connection_required:[409,'Connect your own Google account first.'],calendar_scope_required:[403,'Reconnect Google and approve Calendar access.'],
 calendar_disabled:[503,'Calendar viewing is not enabled yet.'],calendar_write_disabled:[503,'Calendar editing is not enabled yet.'],
 calendar_manage_required:[403,'Enable Calendar editing before creating or changing an appointment.'],calendar_write_scope_required:[403,'Enable Calendar editing and approve the additional permission.'],
 calendar_not_editable:[403,'This appointment can be edited in Google Calendar.'],calendar_event_not_found:[404,'This appointment is no longer available.'],
 calendar_conflict:[409,'This appointment changed. Refresh it and review your changes again.'],calendar_etag_conflict:[409,'This appointment changed. Refresh it and review your changes again.'],
 calendar_review_expired:[409,'This review expired. Review the appointment again.'],calendar_review_required:[400,'Review the appointment before saving.'],
 calendar_request_conflict:[409,'This save request has different details. Review a new save request.'],
 calendar_operation_not_found:[404,'This save request could not be found.'],calendar_write_pending:[409,'This save is still being checked. Use Check save status.'],
 calendar_write_unknown:[409,'The save result is not yet confirmed. Use Check save status before trying another save.'],
 calendar_write_unconfirmed:[504,'The save result is not yet confirmed. Use Check save status before trying another save.'],
 calendar_rate_limited:[429,'Please wait before refreshing Calendar again.'],calendar_reconnect_required:[409,'Reconnect Google to continue.'],
 calendar_api_disabled:[503,'Google Calendar API needs to be enabled by the app administrator.'],calendar_response_invalid:[502,'Calendar returned an unreadable result.'],
 calendar_timeout:[504,'Calendar took too long to respond. Please try again.'],calendar_unavailable:[503,'Calendar is temporarily unavailable.'],
 setup_required:[503,'Google Workspace connection needs setup.'],identity_service_unavailable:[503,'Your account access could not be verified.'],
 connection_configuration_changed:[503,'Google connection settings changed. Refresh its status.'],refresh_pending:[409,'Your Google connection is refreshing. Try again shortly.'],
 refresh_unconfirmed:[503,'Your Google connection could not be refreshed. Check its status.'],reconnect_required:[409,'Reconnect your Google account to continue.'],
 calendar_existing_operation:[409,'An earlier save still needs checking. Check its status before starting another save.'],
 calendar_manage_disabled:[503,'Calendar editing is not enabled yet.'],event_read_only:[403,'This appointment can be edited in Google Calendar.'],
 calendar_review_limit:[429,'Please wait before reviewing another appointment.'],calendar_write_limit:[429,'Please wait before saving another appointment.'],
 confirmation_required:[400,'Review and confirm the appointment before saving.'],
 invalid_calendar_cursor:[400,'Refresh the calendar before loading more appointments.'],invalid_calendar_draft:[400,'Check the appointment details and try again.'],invalid_calendar_range:[400,'Choose a valid calendar date range.'],
 invalid_event_id:[400,'Choose a valid appointment.'],invalid_event_version:[400,'Refresh this appointment before reviewing changes.'],
 invalid_operation_request:[400,'Check the save request and try again.'],invalid_request_id:[400,'Review a new save request.'],invalid_review_token:[400,'Review the appointment again before saving.'],
 operation_changed:[409,'This save request changed. Check its status before continuing.'],operation_conflict:[409,'This save request has different details. Review a new save request.'],operation_exists:[409,'This save request already exists. Check its status before continuing.'],
 operation_not_found:[404,'This save request could not be found.'],review_expired:[409,'This review expired. Review the appointment again.'],review_session_changed:[409,'Your session changed. Review the appointment again.'],
 origin_denied:[403,'Open Xtreme Avatar directly to continue.'],session_required:[401,'Sign in to Xtreme Avatar to use your calendar.'],
 mixed_identity_headers:[400,'Reload Xtreme Avatar before continuing.'],json_required:[415,'Send a JSON request.'],invalid_json:[400,'Check the calendar request and try again.'],request_body_timeout:[408,'The request took too long. Try again.'],
 rate_limited:[429,'Please wait a moment before trying again.'],not_found:[404,'This calendar route was not found.'],method_not_allowed:[405,'This method is not supported.']
};
const RUNTIME_STATUSES={account_changed:[403,409],invalid_calendar_cursor:[400,409],invalid_review_token:[400,403],calendar_write_unconfirmed:[409,504],reconnect_required:[409,503]};
const runtimeStatus=(code,status)=>Object.hasOwn(M,code)&&(Object.hasOwn(RUNTIME_STATUSES,code)?RUNTIME_STATUSES[code]:[M[code][0]]).includes(status);
const fail=(code,status,terminal,extra={})=>{throw Object.assign(new Error(code),{code,status:status||M[code]?.[0]||503,...(typeof terminal==='boolean'?{terminal}:{}),...extra});};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:privateHeaders({'content-type':'application/json; charset=utf-8'})});
function problem(error){const code=Object.hasOwn(M,error?.code)?error.code:'calendar_unavailable';return json({code,error:M[code][1],...(typeof error?.terminal==='boolean'?{terminal:error.terminal}:{}),...(error?.terminal===true&&uuid(error.requestId)?{requestId:error.requestId}:{}),...(uuid(error?.recoveryRequestId)?{recoveryRequestId:error.recoveryRequestId}:{})},error?.status||M[code][0]);}
function timezone(value){if(!text(value,100)||!value)return false;try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}}
function stamp(value,allDay){return allDay?dateOnly(value):utcInstant(value);}
function times(v){const a=stamp(v.start,v.allDay),b=stamp(v.end,v.allDay);return typeof v.allDay==='boolean'&&a!==null&&b!==null&&b>a&&a>=Date.parse('2000-01-01T00:00:00Z')&&b<=Date.parse('2101-01-01T00:00:00Z');}
function draft(value,output=false){
 if(!shape(value,['title','notes','location','start','end','allDay','timeZone'])||!text(value.title,200)||!value.title.trim()||!text(value.notes,4000,true)||!text(value.location,300)||!timezone(value.timeZone)||!times(value)||stamp(value.end,value.allDay)-stamp(value.start,value.allDay)>366*86400000)fail(output?'calendar_response_invalid':'invalid_request');
 return {title:value.title,notes:value.notes,location:value.location,start:value.start,end:value.end,allDay:value.allDay,timeZone:value.timeZone};
}
function requestRevision(request){
 for(const key of request.headers.keys()){
  if(['authorization','apikey','x-api-key','x-user-id','x-organization-id','x-supabase-user-id'].includes(key)||key.startsWith('oai-authenticated-')||key.startsWith('x-oai-')||(key.startsWith('x-xtreme-')&&!['x-xtreme-account','x-xtreme-connection-revision'].includes(key)))fail('invalid_request');
 }
 const r=request.headers.get('x-xtreme-connection-revision');
 if(!/^[1-9][0-9]{0,15}$/.test(r||'')||!Number.isSafeInteger(Number(r)))fail('connection_revision_required');
 return r;
}
function input(action,v){
 if(action==='range'){
  if(!(shape(v,['rangeStart','rangeEnd'])||shape(v,['rangeStart','rangeEnd','cursor'])))fail('invalid_request');
  const a=utcInstant(v.rangeStart),b=utcInstant(v.rangeEnd);
  if(a===null||b===null||b<=a||b-a>43*86400000||a<Date.parse('2000-01-01T00:00:00Z')||b>Date.parse('2101-01-01T00:00:00Z')||(Object.hasOwn(v,'cursor')&&(typeof v.cursor!=='string'||!/^[A-Za-z0-9_-]{20,8192}$/.test(v.cursor))))fail('invalid_request');
  return {...v};
 }
 if(action==='event'){if(!shape(v,['eventId'])||!ID.test(v.eventId||''))fail('invalid_request');return {eventId:v.eventId};}
 if(action==='prepare'){
  if(!plain(v)||!uuid(v.requestId)||!['create','update'].includes(v.action))fail('invalid_request');
  const keys=v.action==='create'?['requestId','action','draft']:['requestId','action','eventId','etag','draft'];
  if(!shape(v,keys)||(v.action==='update'&&(!ID.test(v.eventId||'')||!text(v.etag,512)||!v.etag)))fail('invalid_request');
  return {...v,draft:draft(v.draft)};
 }
 if(action==='commit'){
  if(!shape(v,['requestId','reviewToken','confirm'])||!uuid(v.requestId)||!reviewToken(v.reviewToken)||v.confirm!==true)fail('invalid_request');
  return {...v};
 }
 if(action==='operation'){
  if(!shape(v,['requestId','reconcile'])||!uuid(v.requestId)||v.reconcile!==true)fail('invalid_request');
  return {...v};
 }
 fail('not_found');
}
function capabilities(v){if(!shape(v,['read','create','manageOwn'])||Object.values(v).some(x=>typeof x!=='boolean')||(v.create&&!v.read)||(v.manageOwn&&!v.read))fail('calendar_response_invalid');return {...v};}
function event(v){
 if(!plain(v)||!ID.test(v.id||'')||!REF.test(v.eventRef||'')||!text(v.title,200)||!text(v.location,300)||!times(v))fail('calendar_response_invalid');
 return {id:v.id,eventRef:v.eventRef,title:v.title||'Untitled appointment',start:v.start,end:v.end,allDay:v.allDay,location:v.location};
}
function safeGoogleUrl(value,drive=false){
 if(value===null&&!drive)return null;
 if(typeof value!=='string'||value.length>2048||/[\s\\]/.test(value))fail('calendar_response_invalid');
 let u;try{u=new URL(value);}catch{fail('calendar_response_invalid');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)fail('calendar_response_invalid');
 if(drive?!(['drive.google.com','docs.google.com'].includes(u.hostname)&&/^\/(?:file|document|spreadsheets|presentation|forms|drive)\//.test(u.pathname)):!(['www.google.com','calendar.google.com'].includes(u.hostname)&&/^\/calendar\//.test(u.pathname)))fail('calendar_response_invalid');
 return u.href;
}
function output(action,v,req,now){
 if(!plain(v))fail('calendar_response_invalid');
 if(action==='range'){
  if(v.state!=='ready'||!timezone(v.timeZone)||utcInstant(v.rangeStart)!==utcInstant(req.rangeStart)||utcInstant(v.rangeEnd)!==utcInstant(req.rangeEnd)||!Array.isArray(v.events)||v.events.length>50||typeof v.hasMore!=='boolean'||typeof v.capped!=='boolean'||!(v.nextCursor===null||(typeof v.nextCursor==='string'&&/^[A-Za-z0-9_-]{20,8192}$/.test(v.nextCursor)))||(v.nextCursor!==null&&!v.hasMore)||(v.capped&&v.nextCursor!==null))fail('calendar_response_invalid');
  const seen=new Set(),a=utcInstant(v.rangeStart),b=utcInstant(v.rangeEnd);
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:v.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const local=t=>Object.fromEntries(fmt.formatToParts(new Date(t)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const date=p=>p.year+'-'+p.month+'-'+p.day,first=local(a),last=local(b),lastExclusive=last.hour==='00'&&last.minute==='00'&&last.second==='00'&&b%1000===0;
  const events=v.events.map(x=>{const e=event(x);if(seen.has(e.id))fail('calendar_response_invalid');seen.add(e.id);
   if(e.allDay?(e.end<=date(first)||(lastExclusive?e.start>=date(last):e.start>date(last))):(utcInstant(e.end)<=a||utcInstant(e.start)>=b))fail('calendar_response_invalid');return e;});
  return {state:'ready',timeZone:v.timeZone,rangeStart:v.rangeStart,rangeEnd:v.rangeEnd,events,hasMore:v.hasMore,nextCursor:v.nextCursor,capped:v.capped};
 }
 if(action==='event'){
  if(v.state!=='ready'||v.event?.id!==req.eventId)fail('calendar_response_invalid');
  const e=event(v.event),d=v.event;
  if(!text(d.etag,512)||!d.etag||!text(d.notes,4000,true)||!timezone(d.timeZone)||typeof d.editable!=='boolean'||!(d.editReason===null||text(d.editReason,160))||!Array.isArray(d.driveLinks)||d.driveLinks.length>20)fail('calendar_response_invalid');
  const caps=capabilities(v.capabilities);if(d.editable&&!caps.manageOwn)fail('calendar_response_invalid');
  return {state:'ready',event:{...e,etag:d.etag,notes:d.notes,timeZone:d.timeZone,editable:d.editable,editReason:d.editReason,googleUrl:safeGoogleUrl(d.googleUrl),driveLinks:d.driveLinks.map(l=>{if(!plain(l)||!text(l.title,200)||!text(l.mimeType,150))fail('calendar_response_invalid');return {title:l.title,url:safeGoogleUrl(l.url,true),mimeType:l.mimeType};})},capabilities:caps};
 }
 if(action==='prepare'){
  const expiry=utcInstant(v.expiresAt);
  if(v.state!=='review'||!uuid(v.requestId)||v.requestId!==req.requestId||v.action!==req.action||!reviewToken(v.reviewToken)||expiry===null||expiry<=now||expiry>now+11*60000||(req.action==='create'?(v.eventId!==null||v.eventRef!==null):(typeof v.eventId!=='string'||v.eventId!==req.eventId||typeof v.eventRef!=='string'||!REF.test(v.eventRef)))||!shape(v.defaults,['visibility','notifications','reminders'])||v.defaults.visibility!=='private'||v.defaults.notifications!==false||v.defaults.reminders!==false||(req.action==='update'&&v.eventId!==req.eventId))fail('calendar_response_invalid');
  return {state:'review',requestId:v.requestId,reviewToken:v.reviewToken,expiresAt:v.expiresAt,action:v.action,eventId:v.eventId,eventRef:v.eventRef,draft:draft(v.draft,true),defaults:{visibility:'private',notifications:false,reminders:false}};
 }
 if(action==='commit'){
  if(v.state!=='completed'||v.requestId!==req.requestId||!ID.test(v.eventId||'')||!REF.test(v.eventRef||'')||!text(v.etag,512)||!v.etag||typeof v.replayed!=='boolean')fail('calendar_response_invalid');
  return {state:'completed',requestId:v.requestId,eventId:v.eventId,eventRef:v.eventRef,etag:v.etag,replayed:v.replayed};
 }
 if(action==='operation'){
  if(!['prepared','pending','unknown','completed','failed'].includes(v.state)||v.requestId!==req.requestId||!(v.eventId===null||ID.test(v.eventId||''))||!(v.eventRef===null||REF.test(v.eventRef||''))||!(v.etag===null||text(v.etag,512))||!(v.code===null||text(v.code,100))||typeof v.terminal!=='boolean'||(['completed','failed'].includes(v.state)!==v.terminal)||(v.state==='completed'&&(!v.eventId||!v.eventRef||!v.etag)))fail('calendar_response_invalid');
  return {state:v.state,requestId:v.requestId,eventId:v.eventId,eventRef:v.eventRef,etag:v.etag,code:v.code===null?null:Object.hasOwn(M,v.code)?v.code:'calendar_unavailable',terminal:v.terminal};
 }
 fail('calendar_response_invalid');
}
export function createCalendarWorkspaceHandler({authClient,fetcher=fetch,now=Date.now}){
 if(typeof authClient!=='function')throw new Error('Server authentication required');
 return async function handle(request){
  let action,dispatched=false;
  try{
   const u=new URL(request.url);action=u.pathname.startsWith(API)?u.pathname.slice(API.length):'';
   if(!ACTIONS.has(action)||u.search)fail('not_found');
   if(request.method!=='POST')fail('method_not_allowed');
   const origin=appOrigin(request,true),revision=requestRevision(request);
   const session=await appSession(authClient);if(request.headers.get('x-xtreme-account')!==session.id)fail('account_changed');
   if(request.signal.aborted)fail('calendar_unavailable');
   const payload=input(action,await boundedJson(request,32768,true));
   let r;const deadline=AbortSignal.timeout(70000);
   dispatched=true;
   try {r=await fetcher(GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/calendar/'+action,{
    method:'POST',redirect:'manual',cache:'no-store',signal:AbortSignal.any([deadline,request.signal]),
    headers:{'content-type':'application/json',accept:'application/json',authorization:'Bearer '+session.token,origin,'x-xtreme-account':session.id,'x-xtreme-connection-revision':revision},
    body:JSON.stringify(payload)
   });}catch{fail(action==='commit'?'calendar_write_unconfirmed':'calendar_unavailable');}
   if(request.signal.aborted){try{await r.body?.cancel();}catch{}fail(action==='commit'?'calendar_write_unconfirmed':'calendar_unavailable');}
   if(r.status>=300&&r.status<400){try{await r.body?.cancel();}catch{}fail(action==='commit'?'calendar_write_unconfirmed':'calendar_response_invalid');}
   const data=await boundedJson(r,r.ok?131072:8192);
   if(!r.ok){
    if(plain(data)&&typeof data.code==='string'&&runtimeStatus(data.code,r.status)){
     const matchingRequest=uuid(payload.requestId)&&data.requestId===payload.requestId;
     const terminal=action==='commit'&&data.ok===false&&data.terminal===true&&matchingRequest;
     const recovery=data.code==='calendar_existing_operation'&&r.status===409&&data.ok===false&&data.terminal===false&&matchingRequest&&uuid(data.recoveryRequestId)?data.recoveryRequestId:null;
     fail(data.code,r.status,terminal?true:undefined,{...(terminal?{requestId:payload.requestId}:{}),...(recovery?{recoveryRequestId:recovery}:{})});
    }
    if(r.status===401)fail('sign_in_required');if(r.status===403)fail('access_required');if(r.status===409)fail('connection_changed');if(r.status===429)fail('rate_limited');
    fail(action==='commit'?'calendar_write_unconfirmed':'calendar_unavailable');
   }
   if(r.status!==200)fail(action==='commit'?'calendar_write_unconfirmed':'calendar_response_invalid');
   let result;try{result=output(action,data,payload,now());}catch(e){if(action==='commit')fail('calendar_write_unconfirmed');throw e;}
   return json(result);
  }catch(e){if(action==='commit'&&dispatched&&e?.terminal!==true)return problem({code:'calendar_write_unconfirmed',status:504,terminal:false,...(uuid(e?.recoveryRequestId)?{recoveryRequestId:e.recoveryRequestId}:{})});return problem(e);}
 };
}

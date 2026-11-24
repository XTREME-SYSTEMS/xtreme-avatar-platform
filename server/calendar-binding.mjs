// Server-only binding between an app member, their Google grant and one event.
// This is authorization context, not a browser-provided eventRef or public URL.
import { GOOGLE_APP_ORIGINS, GOOGLE_RUNTIME_ORIGIN } from './google-workspace-proxy.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT=/^[A-Za-z0-9_-]{1,256}$/;
const REF=/^ce1_[0-9a-f]{64}$/;
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
async function smallJson(response) {
 const reader=response.body?.getReader(); if(!reader)fail(502,'calendar_response_invalid','Calendar returned an unreadable result.');
 const chunks=[]; let size=0;
 try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();fail(502,'calendar_response_invalid','Calendar returned an unreadable result.');}chunks.push(value);}}
 finally {reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(502,'calendar_response_invalid','Calendar returned an unreadable result.');}
}
const problems=Object.freeze({
 sign_in_required:[401,'Sign in again to open your job files.'],
 google_connection_required:[409,'Connect your Google account to open this appointment.'],
 calendar_scope_required:[403,'Reconnect Google and approve Calendar access.'],
 connection_changed:[409,'Your Google account changed. Refresh before continuing.'],
 calendar_reconnect_required:[409,'Reconnect Google before opening this appointment.'],
 calendar_disabled:[503,'Calendar viewing is not enabled yet.'],
 calendar_rate_limited:[429,'Please wait before opening more job files.'],
 access_required:[403,'Your account no longer has access.'],
 identity_service_unavailable:[503,'Your account access could not be verified.'],
 calendar_timeout:[504,'Calendar took too long to respond.']
});
export async function resolveCalendarBinding({accessToken,userId,origin,eventId,connectionRevision,fetcher=fetch,signal}) {
 if(!GOOGLE_APP_ORIGINS.includes(origin))fail(403,'invalid_origin','Open this request from Xtreme Avatar.');
 if(!UUID.test(userId||'')||typeof accessToken!=='string'||!accessToken||accessToken.length>16384||/\s/.test(accessToken))fail(401,'sign_in_required','Sign in again to open your job files.');
 if(!EVENT.test(eventId||''))fail(400,'invalid_request','Choose a valid appointment.');
 const revision=typeof connectionRevision==='number'?String(connectionRevision):connectionRevision;
 if(!/^[1-9][0-9]{0,15}$/.test(revision||'')||!Number.isSafeInteger(Number(revision)))fail(400,'connection_revision_required','Refresh your Google connection.');
 if(signal?.aborted)fail(409,'request_cancelled','This request was cancelled.');
 let response;const deadline=AbortSignal.timeout(70000);
 try {response=await fetcher(GOOGLE_RUNTIME_ORIGIN+'/xtreme/v2/google/calendar/context',{
  method:'POST',redirect:'manual',cache:'no-store',signal:signal?AbortSignal.any([deadline,signal]):deadline,
  headers:{'content-type':'application/json',accept:'application/json',authorization:'Bearer '+accessToken,origin,'x-xtreme-account':userId,'x-xtreme-connection-revision':revision},
  body:JSON.stringify({eventId})
 });}catch{fail(503,'calendar_unavailable','Calendar is temporarily unavailable.');}
 if(signal?.aborted){try{await response.body?.cancel();}catch{}fail(409,'request_cancelled','This request was cancelled.');}
 if(response.status>=300&&response.status<400){try{await response.body?.cancel();}catch{}fail(502,'calendar_response_invalid','Calendar returned an unreadable result.');}
 const data=await smallJson(response);
 if(!response.ok){
  const p=data&&typeof data.code==='string'&&Object.hasOwn(problems,data.code)?problems[data.code]:null;
  if(p&&p[0]===response.status)fail(p[0],data.code,p[1]);
  if(response.status===401)fail(401,'sign_in_required','Sign in again to open your job files.');
  if(response.status===403)fail(403,'access_required','Your account no longer has access.');
  if(response.status===409)fail(409,'connection_changed','Your Google account changed. Refresh before continuing.');
  fail(503,'calendar_unavailable','Calendar is temporarily unavailable.');
 }
 if(response.status!==200||!data||typeof data!=='object'||Array.isArray(data)||data.eventId!==eventId||data.connectionRevision!==Number(revision)||typeof data.eventRef!=='string'||!REF.test(data.eventRef))fail(502,'calendar_response_invalid','Calendar returned an unreadable result.');
 return Object.freeze({eventRef:data.eventRef,eventId,connectionRevision:Number(revision)});
}

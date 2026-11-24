import {validateAssistantActions} from './assistant-action-receipts.mjs';
import {requireMember,readBody,jsonResponse} from './accounts.mjs';
import {personalContextForUser,PERSONAL_CONTEXT_BYTES} from './assistant-personalization.mjs';
import {verifyLinkedCallDeskContext} from './call-desk-link.mjs';

const APP='appgprj_6aec7688554c819181a5cae574c92008';
const SERVICE='https://eden-outbound-call-sandbox-code.up.railway.app';
const PREFIX='/assistant/v1/voice/';
const KEY='assistant_voice_request';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION=/^[A-Za-z0-9_-]{1,256}$/;
const STATES=new Set(['creating','attaching','ready','closing','uncertain','closed','rejected']);
// These errors occur before Railway reserves or creates a provider session.
const NO_START=new Set(['browser_voice_disabled','app_capability_missing','provider_key_missing','approved_voice_required','runtime_not_ready','prior_session_requires_reconciliation','user_daily_limit','service_daily_limit','service_busy','member_session_in_progress','invalid_sdp','invalid_request_id','invalid_context']);
// These v2 errors are emitted before this attempt reaches the voice controller.
// They do not prove the outcome of a previous or concurrent start attempt.
const V2_NO_START=new Set(['supabase_voice_not_configured','origin_denied','mixed_identity_headers','session_required','membership_or_session_required','confirmed_account_required','voice_membership_required','invalid_identity','identity_service_unavailable','invalid_private_context']);
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
const fail=(status,message,code='voice_unavailable')=>{throw Object.assign(new Error(message),{status,code});};
async function hmac(secret,value){const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc.encode(value)));}
function secretFor(env){if(env.MIGRATED_IDENTITY){if(env.VOICE_V2_ENABLED!==true||!env.ACCESS_TOKEN||!env.AUTH_USER?.id)fail(503,'Live voice is awaiting its verified account connection.','runtime_not_ready');return null;}if(typeof env.XTREME_ASSISTANT_SECRET!=='string'||env.XTREME_ASSISTANT_SECRET.length<48)fail(503,'Voice is awaiting its secure connection.');return env.XTREME_ASSISTANT_SECRET;}
async function boundedJson(response){
 const reader=response.body?.getReader();if(!reader)fail(502,'Voice returned an unreadable response.','outcome_unknown');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();fail(502,'Voice returned an unreadable response.','outcome_unknown');}chunks.push(value);}}
 catch(error){if(error.status)throw error;fail(502,'The voice result has not been confirmed.','outcome_unknown');}
 const all=new Uint8Array(size);let offset=0;for(const value of chunks){all.set(value,offset);offset+=value.length;}
 try{return JSON.parse(new TextDecoder().decode(all));}catch{fail(502,'Voice returned an unreadable response.','outcome_unknown');}
}
export async function voiceServiceRequest(env,userId,action,payload,fetcher=fetch){
 if(!['status','start','end'].includes(action))fail(404,'Not found.');
 if(env.MIGRATED_IDENTITY){
  secretFor(env);
  if(userId!==env.AUTH_USER.id)fail(403,'Account access changed.','account_changed');
  let response;
  try{response=await fetcher(SERVICE+'/xtreme/v2/voice/'+action,{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(action==='status'?15000:50000),
   headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+env.ACCESS_TOKEN,'Origin':env.APP_ORIGIN},
   body:JSON.stringify(payload)
  });}catch{fail(502,'The voice result has not been confirmed. Check this session before starting another.','outcome_unknown');}
  if(response.status>=300&&response.status<400)fail(502,'Voice could not be reached securely.','outcome_unknown');
  return {status:response.status,data:await boundedJson(response)};
 }

 const secret=secretFor(env),path=PREFIX+action,body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomUUID();
 const subject=await hmac(secret,JSON.stringify(['xtreme-assistant-user-v1',APP,userId]));
 const digest=hex(await crypto.subtle.digest('SHA-256',enc.encode(body)));
 const signature=await hmac(secret,JSON.stringify(['xtreme-assistant-v1',APP,subject,'POST',path,timestamp,nonce,digest]));
 let response;
 try{response=await fetcher(SERVICE+path,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(action==='status'?15000:50000),headers:{'Content-Type':'application/json','Accept':'application/json','X-Xtreme-App-Id':APP,'X-Xtreme-User-Id':subject,'X-Xtreme-Timestamp':timestamp,'X-Xtreme-Nonce':nonce,'X-Xtreme-Signature':signature},body});}
 catch{fail(502,'The voice result has not been confirmed. Check this session before starting another.','outcome_unknown');}
 if(response.status>=300&&response.status<400)fail(502,'Voice could not be reached securely.','outcome_unknown');
 const data=await boundedJson(response);
 return {status:response.status,data};
}
async function verifyActive(db,id){if(!await db.prepare("SELECT user_id FROM members WHERE user_id=? AND status='active'").bind(id).first())fail(403,'Account access has changed. Sign in again.','account_changed');}
async function pending(db,id){
 const row=await db.prepare('SELECT value,version FROM private_state WHERE user_id=? AND key=?').bind(id,KEY).first();
 if(!row)return null;
 let value;try{value=JSON.parse(row.value);}catch{fail(503,'The previous voice session needs recovery.','outcome_unknown');}
 if(typeof value?.requestId!=='string'||!UUID.test(value.requestId))fail(503,'The previous voice session needs recovery.','outcome_unknown');
 if(Object.hasOwn(value,'context')){
  if(typeof value.context!=='string'||!value.context.trim()||enc.encode(value.context).length>PERSONAL_CONTEXT_BYTES||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value.context)||typeof value.sdpHash!=='string'||!/^([a-f0-9]{64})$/.test(value.sdpHash)||!Number.isSafeInteger(value.link?.linkRevision)||value.link.linkRevision<1||typeof value.link?.accountGeneration!=='string'||!value.link.accountGeneration)fail(503,'The previous voice session needs recovery.','outcome_unknown');
 }
 return {...value,version:row.version,storedValue:row.value};
}
async function release(db,id,row){const result=await db.prepare('DELETE FROM private_state WHERE user_id=? AND key=? AND version=? AND value=?').bind(id,KEY,row.version,row.storedValue).run();return result.meta.changes===1;}
async function reserve(db,id,rid,personal,sdpHash){
 const reservationId=crypto.randomUUID();
 const inserted=await db.prepare("INSERT OR IGNORE INTO private_state(user_id,key,value,version,updated_at) SELECT ?,?,?,1,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(id,KEY,JSON.stringify({requestId:rid,reservationId,...(personal?{context:personal.text,link:personal.link,sdpHash,profileRevision:personal.profileRevision,coachingRevision:personal.coachingRevision,partialContext:personal.partial}:{})}),new Date().toISOString(),id).run();
 const row=await pending(db,id);if(!row||row.requestId!==rid)fail(409,'Check the previous voice session before starting another.','request_pending');
 // INSERT ownership is valid only for the untouched exact row we inserted.
 // A replacement or intervening retry may already own/dispatch this request ID.
 if(inserted.meta.changes===1&&(row.reservationId!==reservationId||row.version!==1))fail(409,'This voice request is being checked in another session. Check its status before retrying.','request_pending');
 return {...row,freshReservation:inserted.meta.changes===1&&row.reservationId===reservationId&&row.version===1};
}
async function claimStartAttempt(db,id,row){
 const result=await db.prepare("UPDATE private_state SET version=version+1,updated_at=? WHERE user_id=? AND key=? AND version=? AND value=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(new Date().toISOString(),id,KEY,row.version,row.storedValue,id).run();
 if(result.meta.changes!==1)fail(409,'This voice request is being checked in another session. Check its status before retrying.','request_pending');
 return {...row,version:row.version+1};
}
function receipt(data,rid,includeSdp=false){
 if(!data||data.requestId!==rid||!STATES.has(data.state)||typeof data.finalized!=='boolean'||(data.finalized!==(data.state==='closed'))||!Number.isFinite(data.expiresAt)||data.maxSeconds!==180||data.model!=='gpt-live-1'||typeof data.configurationVerified!=='boolean'||(data.sessionId!==null&&(typeof data.sessionId!=='string'||!SESSION.test(data.sessionId))))fail(502,'The voice result has not been confirmed.','outcome_unknown');
 const result={ok:data.ok===true,requestId:rid,state:data.state,sessionId:data.sessionId,expiresAt:data.expiresAt,maxSeconds:180,model:data.model,configurationVerified:data.configurationVerified,finalized:data.finalized};
 const actions=validateAssistantActions(data.actions,{max:12,history:true});if(actions.length)result.actions=actions;
 if(typeof data.reason==='string'&&/^[a-z_]{1,80}$/.test(data.reason))result.reason=data.reason;
 if(Number.isFinite(data.usageSeconds)&&data.usageSeconds>=0)result.usageSeconds=data.usageSeconds;
 if(includeSdp&&data.state==='ready'){
  if(data.ok!==true||data.configurationVerified!==true||!data.sessionId||typeof data.sdp!=='string'||enc.encode(data.sdp).length>24000||!data.sdp.startsWith('v=0'))fail(502,'The voice answer has not been confirmed.','outcome_unknown');
  result.sdp=data.sdp;
 }
 return result;
}
function upstreamError(status,data){
 const reason=typeof data?.reason==='string'&&/^[a-z_]{1,80}$/.test(data.reason)?data.reason:'outcome_unknown';
 const message=reason.endsWith('daily_limit')?'Your voice allowance has been reached for today.':reason==='session_not_found'?'This voice session has not been found yet. Check again before starting another.':'Voice is not available yet. Check this session before starting another.';
 fail(status===429?429:status===404?404:status===409?409:503,message,reason);
}
export async function handleAssistantVoice(request,env,fetcher=fetch){
 try{
  const url=new URL(request.url),action=url.pathname.slice('/api/assistant/voice/'.length);
  if(!['status','start','end'].includes(action)||(url.search&&(action!=='status'||[...url.searchParams.keys()].join(',')!=='requestId')))return jsonResponse({error:'Not found.'},404);
  if(request.method!==(action==='status'?'GET':'POST'))return jsonResponse({error:'Method not allowed.'},405);
  const input=request.method==='POST'?await readBody(request):null;
  const user=await requireMember(request,env),db=env.DB,id=user.user_id;
  if(request.headers.get('x-xtreme-account')!==id)fail(409,'Your signed-in account changed. Reload before continuing.','account_changed');
  secretFor(env);
  const rid=action==='status'?url.searchParams.get('requestId'):input?.requestId;
  if(rid!==null&&(typeof rid!=='string'||!UUID.test(rid)))fail(400,'Invalid voice request.','invalid_request');
  if(action==='status'&&!rid){
   const upstream=await voiceServiceRequest(env,id,'status',{},fetcher);
   if(upstream.status!==200||typeof upstream.data?.ready!=='boolean')upstreamError(upstream.status,upstream.data);
   let row=await pending(db,id);
   if(row){
    try{const check=await voiceServiceRequest(env,id,'status',{requestId:row.requestId},fetcher);if(check.status===200){const r=receipt(check.data,row.requestId);if(r.finalized||r.state==='rejected'){await release(db,id,row);row=await pending(db,id);}}}catch{/* Preserve the recovery lock on uncertain transport. */}
   }
   await verifyActive(db,id);
   return jsonResponse({ready:upstream.data.ready===true,model:'gpt-live-1',maxSeconds:180,reason:upstream.data.ready?'':'Voice is not available yet.',pendingRequest:row?{requestId:row.requestId}:null});
  }
  if(action==='start'&&(!input||Object.keys(input).sort().join(',')!=='requestId,sdp'||typeof input.sdp!=='string'||enc.encode(input.sdp).length>24000||!input.sdp.startsWith('v=0')||!input.sdp.includes('m=audio ')||input.sdp.includes('\0')))fail(400,'Invalid microphone connection.','invalid_request');
  if(action==='end'&&(!input||!['requestId','requestId,sessionId'].includes(Object.keys(input).sort().join(','))||(Object.hasOwn(input,'sessionId')&&(typeof input.sessionId!=='string'||!SESSION.test(input.sessionId)))))fail(400,'Invalid voice request.','invalid_request');
  let row=await pending(db,id);
  if(action==='start'){
   if(row&&row.requestId!==rid)fail(409,'Check the previous voice session before starting another.','request_pending');
   if(!row){
    // Read canonical context before admission. Failure has not created a paid
    // session. Only this member's verified link may supply personal data.
    let personal;try{personal=await personalContextForUser(env,id,fetcher);}catch(error){error.terminal=true;throw error;}
    const payload={...input,...(personal?{context:personal.text}:{})};
    if(enc.encode(JSON.stringify(payload)).length>32768)throw Object.assign(new Error('The microphone connection is too large. Start a new voice session.'),{status:400,code:'invalid_request',terminal:true});
    const sdpHash=hex(await crypto.subtle.digest('SHA-256',enc.encode(input.sdp)));
    row=await reserve(db,id,rid,personal,sdpHash);
   }else if(row.context){
    // A retry never refreshes its saved memory. Revalidate the exact link so a
    // revoked/deleted/relinked account cannot submit the old snapshot again.
    await verifyLinkedCallDeskContext(env,id,row.link,fetcher);
   }
   if(row.sdpHash&&row.sdpHash!==hex(await crypto.subtle.digest('SHA-256',enc.encode(input.sdp))))fail(409,'This request belongs to an earlier microphone connection. Check or end that session first.','request_conflict');
  }
  await verifyActive(db,id);
  // Version ownership prevents a failed attempt from deleting a concurrent retry's reservation.
  if(action==='start'&&env.MIGRATED_IDENTITY)row=await claimStartAttempt(db,id,row);
  const payload=action==='status'?{requestId:rid}:action==='start'&&row.context?{...input,context:row.context}:input;
  const upstream=await voiceServiceRequest(env,id,action,payload,fetcher);
  // A known pre-admission failure did not create a session. Unknown results keep
  // the private request ID, including across reloads and lost HTTP responses.
  const v2Rejection=env.MIGRATED_IDENTITY&&upstream.data?.ok===false&&Object.keys(upstream.data).sort().join(',')==='ok,reason'&&V2_NO_START.has(upstream.data.reason);
  const knownNoStart=(NO_START.has(upstream.data?.reason)||v2Rejection)&&(!env.MIGRATED_IDENTITY||row?.freshReservation===true);
  if(action==='start'&&upstream.status>=400&&knownNoStart&&await release(db,id,row)){const error=Object.assign(new Error('Voice could not start. Your microphone can be released.'),{status:upstream.status===429?429:503,code:upstream.data.reason,terminal:true});throw error;}
  if(![200,201,202,409].includes(upstream.status)||!upstream.data?.state)upstreamError(upstream.status,upstream.data);
  const result=receipt(upstream.data,rid,action==='start');
  if(action==='start')result.personalization={contextIncluded:!!row?.context,source:row?.context?'call_desk':null,partial:row?.partialContext===true};
  if(row?.requestId===rid&&(result.finalized||result.state==='rejected'))await release(db,id,row);
  try{await verifyActive(db,id);}catch(error){
   // Access may be revoked while the provider allocates this exact session.
   // Do not release its SDP; attempt only same-account cleanup, never a new start.
   if(action==='start'&&!result.finalized&&result.state!=='rejected'){
    try{const stopped=await voiceServiceRequest(env,id,'end',{requestId:rid,...(result.sessionId?{sessionId:result.sessionId}:{})},fetcher);if([200,202].includes(stopped.status)){const final=receipt(stopped.data,rid);if(row?.requestId===rid&&(final.finalized||final.state==='rejected'))await release(db,id,row);}}catch{/* Keep the durable recovery identity until finalization is verified. */}
   }
   throw error;
  }
  // Receipt states remain recoverable even when a duplicate start got HTTP 409.
  return jsonResponse(result,upstream.status===409?202:upstream.status);
 }catch(error){return jsonResponse({error:error.status?error.message:'Voice is temporarily unavailable.',code:error.code||'voice_unavailable',...(error.terminal?{terminal:true}:{})},error.status||503);}
}

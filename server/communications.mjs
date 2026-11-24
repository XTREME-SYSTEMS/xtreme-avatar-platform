import { requireMember, readBody, jsonResponse } from './accounts.mjs';

// Existing single-operator bridge. Never accept an upstream URL or credentials from the browser.
const BRIDGE_ORIGIN='https://eden-outbound-call-sandbox-code.up.railway.app';
const APP='appgprj_6aec7688554c819181a5cae574c92008';
const CALLS_PATH='/assistant/v1/calls';
const ID=/^[A-Za-z0-9_-]{1,64}$/;
const PHONE=/^\+[1-9][0-9]{7,14}$/;
const identifier=value=>typeof value==='string'&&ID.test(value);
const STATES=new Set(['prepared','checking','planned','submitting','uncertain','queued','initiated','ringing','in-progress','completed','busy','failed','no-answer','canceled','rejected','expired']);
const fail=(status,message,code)=>{throw Object.assign(new Error(message),{status,code});};
const text=(v,n=320,empty=false)=>typeof v==='string'&&v.length<=n&&(empty||v.trim().length>0)&&!/[\u0000-\u001f\u007f\u2028\u2029]/.test(v);
const shape=(v,required,optional=[])=>v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const timezone=v=>{if(!text(v,80))return false;try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}};
const duration=v=>v===undefined||(Number.isInteger(v)&&v>=15&&v<=900);
const actions=new Set(['readiness','resume','prepare','start','status','hangup','conference_prepare','conference_dial_leg','conference_status','conference_end']);
const dialing=new Set(['start','conference_dial_leg']);
const changing=new Set(['start','conference_dial_leg','hangup','conference_end']);
const ACTIVE=new Set(['checking','submitting','uncertain','queued','initiated','ringing','in-progress']);
function valid(action,a){
 if(action==='readiness'||action==='resume')return shape(a,[]);
 if(action==='prepare')return shape(a,['request_id','to','purpose','mode','recipient_timezone'],['recipient_name','caller_name','caller_context','max_seconds','phone_dictation'])&&text(a.request_id,96)&&PHONE.test(a.to)&&text(a.purpose)&&['eden_speaks','private_copilot'].includes(a.mode)&&timezone(a.recipient_timezone)&&duration(a.max_seconds)&&['recipient_name','caller_name'].every(k=>a[k]===undefined||text(a[k],80,true))&&(a.caller_context===undefined||text(a.caller_context,160,true))&&(a.phone_dictation===undefined||typeof a.phone_dictation==='boolean')&&(!a.phone_dictation||a.mode==='private_copilot');
 if(action==='conference_prepare')return shape(a,['request_id','purpose','operator_timezone','recipients'],['max_seconds'])&&text(a.request_id,96)&&text(a.purpose)&&timezone(a.operator_timezone)&&duration(a.max_seconds)&&Array.isArray(a.recipients)&&a.recipients.length===2&&a.recipients.every(r=>shape(r,['to','recipient_timezone'])&&PHONE.test(r.to)&&timezone(r.recipient_timezone))&&a.recipients[0].to!==a.recipients[1].to;
 const conference=action.startsWith('conference_'),key=conference?'conference_id':'call_id';
 if(dialing.has(action))return shape(a,[key,'confirm_to','confirm_purpose','recipient_consented','approve_charges',...(conference?['step']:[])])&&identifier(a[key])&&PHONE.test(a.confirm_to)&&text(a.confirm_purpose)&&a.recipient_consented===true&&a.approve_charges===true&&(!conference||(Number.isInteger(a.step)&&a.step>=1&&a.step<=3));
 return shape(a,[key],action==='status'?['local_only']:[])&&identifier(a[key])&&(a.local_only===undefined||typeof a.local_only==='boolean');
}
function binding(env){
 // Prefer the dedicated application capability. Never export or require the
 // runtime's provider credentials, and never downgrade an invalid capability.
 if(env.XTREME_ASSISTANT_SECRET!==undefined){
  if(typeof env.XTREME_ASSISTANT_SECRET!=='string'||env.XTREME_ASSISTANT_SECRET.length<48||/[\r\n]/.test(env.XTREME_ASSISTANT_SECRET))fail(503,'Calling is not connected to this app yet.','bridge_unlinked');
  return {url:BRIDGE_ORIGIN+CALLS_PATH,secret:env.XTREME_ASSISTANT_SECRET,mode:'app_hmac'};
 }
 let u;try{u=new URL(env.BRIDGE_URL);}catch{fail(503,'Calling is not connected to this app yet.','bridge_unlinked');}
 if(u.origin!==BRIDGE_ORIGIN||u.pathname!=='/'||u.search||u.hash||u.username||u.password||typeof env.BRIDGE_TOKEN!=='string'||env.BRIDGE_TOKEN.length<32||/[\r\n]/.test(env.BRIDGE_TOKEN))fail(503,'Calling is not connected to this app yet.','bridge_unlinked');
 return {url:BRIDGE_ORIGIN+'/mcp',secret:env.BRIDGE_TOKEN,mode:'legacy'};
}
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function decode(value){if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error();return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
async function key(secret){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
async function hmac(secret,value){return hex(await crypto.subtle.sign('HMAC',await key(secret),new TextEncoder().encode(value)));}
async function sign(payload,secret){const body=encode(new TextEncoder().encode(JSON.stringify(payload)));return body+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),new TextEncoder().encode(body))));}
async function readRecovery(env,user,origin){
 const row=await env.DB.prepare("SELECT value,version FROM private_state WHERE user_id=? AND key='call_review'").bind(user.user_id).first();
 if(!row)return null;
 let record;try{record=JSON.parse(row.value);}catch{fail(503,'The saved call needs recovery in the private Call Desk.','recovery_unavailable');}
 const p=record?.review,kind=record?.kind;
 if(!['call','conference'].includes(kind)||!p||p.v!=='xtreme-review-1'||p.owner!==user.user_id||p.origin!==origin||p.kind!==kind||!identifier(p.id)||!Number.isFinite(p.expires))fail(503,'The saved call needs recovery in the private Call Desk.','recovery_unavailable');
 const data=safeReceipt(record.data,kind==='conference');
 if(data[kind+'_id']!==p.id||data.purpose!==p.purpose||(kind==='call'&&data.to!==p.to)||(kind==='conference'&&data.steps.some((s,i)=>s.to!==p.steps?.[i]?.to)))fail(503,'The saved call needs recovery in the private Call Desk.','recovery_unavailable');
 return {version:row.version,record:{...record,data}};
}
function unresolved(record){return record.pending===true||(record.kind==='call'?ACTIVE.has(record.data.state):record.data.requires_reconciliation||record.data.steps.some(s=>ACTIVE.has(s.state)));}
async function saveRecovery(env,user,record,version){
 const value=JSON.stringify(record),now=new Date().toISOString();
 const result=version===null
  ?await env.DB.prepare("INSERT OR IGNORE INTO private_state(user_id,key,value,version,updated_at) SELECT ?,'call_review',?,1,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND role='owner' AND status='active')").bind(user.user_id,value,now,user.user_id).run()
  :await env.DB.prepare("UPDATE private_state SET value=?,version=version+1,updated_at=? WHERE user_id=? AND key='call_review' AND version=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND role='owner' AND status='active')").bind(value,now,user.user_id,version,user.user_id).run();
 if(result.meta?.changes!==1)fail(409,'This call changed in another window. Resume its current status before continuing.','recovery_conflict');
 return version===null?1:version+1;
}
async function review(token,secret,user,origin,action,args){
 let p;try{
  if(typeof token!=='string'||token.length>6000)throw new Error();
  const parts=token.split('.');if(parts.length!==2||!await crypto.subtle.verify('HMAC',await key(secret),decode(parts[1]),new TextEncoder().encode(parts[0])))throw new Error();
  p=JSON.parse(new TextDecoder().decode(decode(parts[0])));
 }catch{fail(409,'Review this call in the app before continuing.','review_required');}
 const kind=action.startsWith('conference_')?'conference':'call',id=args[kind+'_id'];
 if(p.v!=='xtreme-review-1'||p.owner!==user.user_id||p.origin!==origin||p.kind!==kind||p.id!==id)fail(409,'This review does not belong to this call and account.','review_mismatch');
 if(dialing.has(action)){
  if(!Number.isFinite(p.expires)||Date.now()>p.expires)fail(409,'This call review expired. Prepare it again.','review_expired');
  const to=kind==='call'?p.to:p.steps?.find(s=>s.step===args.step)?.to;
  if(to!==args.confirm_to||p.purpose!==args.confirm_purpose)fail(409,'Confirm the exact reviewed recipient and purpose.','review_mismatch');
 }
 return p;
}
const GATES=new Set(['live calling and provider usage enabled','public HTTPS origin','Twilio account SID','Twilio auth token','Twilio caller ID','operator bearer','OpenAI project key and GPT-Live model','consented destination allowlist','bounded call limits','GPT-Live handshake verifier','operator-approved voice','EDEN_PHONE_VOICE and APPROVED_VOICE_ID must contain a voice ID, not a model name','private copilot enabled','operator phone','PHONE_DICTATION_ENABLED','EDEN_THREE_WAY_ENABLED','EDEN_BATCH_CALLS_ENABLED','two distinct consented guest numbers','daily capacity for three call legs','operator distinct from caller ID','at least one ready single-call mode']);
function gateList(v){return Array.isArray(v)?v.slice(0,30).map(x=>GATES.has(x)?x:'Required bridge configuration'):['Readiness could not be verified'];}
function safeReadiness(d){
 const out={human_only_conference:true,modes:{},extensions:{}};
 for(const k of ['daily_call_limit_utc','daily_call_used_or_reserved_utc','daily_call_remaining_utc','max_seconds'])if(Number.isSafeInteger(d[k])&&d[k]>=0)out[k]=d[k];
 if(typeof d.active_or_uncertain_call==='boolean')out.active_or_uncertain_call=d.active_or_uncertain_call;
 if(typeof d.daily_call_resets_at_utc==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(d.daily_call_resets_at_utc))out.daily_call_resets_at_utc=d.daily_call_resets_at_utc;
 for(const m of ['eden_speaks','private_copilot'])out.modes[m]={configuration_missing:gateList(d.modes?.[m]?.configuration_missing)};
 for(const x of ['three_way','batch_calls','phone_dictation'])out.extensions[x]={configured:d.extensions?.[x]?.configured===true,missing:gateList(d.extensions?.[x]?.missing)};
 return out;
}
function safeReceipt(d,conference){
 if(conference){
  if(!identifier(d.conference_id)||!text(d.purpose)||!Number.isInteger(d.max_seconds)||d.max_seconds<15||d.max_seconds>900||!Array.isArray(d.steps)||d.steps.length!==3||d.steps.some((s,i)=>!s||s.step!==i+1||!PHONE.test(s.to)||!STATES.has(s.state)))fail(502,'The bridge returned an unreadable receipt. Check status before retrying.','bridge_receipt_invalid');
  return {conference_id:d.conference_id,purpose:d.purpose,max_seconds:d.max_seconds,human_only:true,ended:d.ended===true,stop_requested:d.stop_requested===true,requires_reconciliation:d.requires_reconciliation===true,steps:d.steps.map(s=>({step:s.step,to:s.to,state:s.state,consented_on_phone:s.consented_on_phone===true,joined_room:s.joined_room===true}))};
 }
 if(!identifier(d.call_id)||!PHONE.test(d.to)||!text(d.purpose)||!STATES.has(d.state)||!['eden_speaks','private_copilot'].includes(d.mode))fail(502,'The bridge returned an unreadable receipt. Check status before retrying.','bridge_receipt_invalid');
 const out={call_id:d.call_id,to:d.to,purpose:d.purpose,mode:d.mode,state:d.state,stop_requested:d.stop_requested===true};
 for(const k of ['recipient_name','caller_name','caller_context','recipient_timezone'])if(text(d[k],k==='caller_context'?160:80,true))out[k]=d[k];
 for(const k of ['max_seconds','expires_at','prior_ai_consent_at'])if(Number.isFinite(d[k]))out[k]=d[k];
 if(typeof d.sid==='string'&&/^CA[0-9a-fA-F]{32}$/.test(d.sid))out.sid=d.sid;
 if(typeof d.last_event==='string'&&/^[a-z_]{1,80}$/.test(d.last_event))out.last_event=d.last_event;
 if(['completed','failed','canceled','rejected'].includes(d.state)&&Array.isArray(d.events)){const reason=d.events.slice(-100).reverse().find(e=>['recipient_consent_timeout','recipient_declined'].includes(e?.code));if(reason)out.end_reason=reason.code;}
 if(['uncertain','submitting'].includes(d.state))out.recovery='Check this call’s status before any further action. Do not redial.';
 return out;
}
function bridgeFailure(message){
 const known=[[/allowlist|previously consented|no longer authorized/i,'This recipient is not currently approved on the calling bridge.','recipient_not_approved'],[/Missing:|configuration|enabled/i,'This calling mode still needs bridge setup. Check readiness.','mode_unavailable'],[/quota|daily.*limit/i,'The configured daily calling allowance is insufficient.','daily_limit'],[/8am|calling window/i,'This is outside the recipient’s permitted calling hours.','calling_hours'],[/earlier participant|previous call/i,'Wait for the earlier participant to accept and join.','participant_pending'],[/expired/i,'The prepared call has expired.','review_expired'],[/active|uncertain|reconciliation/i,'Another call is active or unresolved. Check its status.','call_unresolved'],[/request_id.*different|request ID.*another/i,'This request already identifies a different call. Prepare a new review.','request_conflict']];
 for(const [pattern,error,code] of known)if(pattern.test(message))fail(409,error,code);
 fail(409,'The bridge did not approve this action. Check readiness and the current call status before retrying.','bridge_rejected');
}
async function invoke(action,args,config,user,fetcher){
 const headers={'content-type':'application/json',accept:'application/json'};
 let body;
 if(config.mode==='app_hmac'){
  // Owner authority comes only from the active Site member checked below. The
  // runtime also pins this opaque owner subject, independently of the browser.
  body=JSON.stringify({action,args,owner:true});
  const subject=await hmac(config.secret,JSON.stringify(['xtreme-assistant-user-v1',APP,user.user_id]));
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomUUID();
  const digest=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)));
  Object.assign(headers,{
   'X-Xtreme-App-Id':APP,'X-Xtreme-User-Id':subject,'X-Xtreme-Timestamp':timestamp,'X-Xtreme-Nonce':nonce,
   'X-Xtreme-Signature':await hmac(config.secret,JSON.stringify(['xtreme-assistant-v1',APP,subject,'POST',CALLS_PATH,timestamp,nonce,digest]))
  });
 }else{
  headers.authorization='Bearer '+config.secret;
  body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'eden_'+action,arguments:args}});
 }
 let response;try{response=await fetcher(config.url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(dialing.has(action)?55000:12000),headers,body});}catch{fail(502,'The bridge did not confirm this request. Check status before retrying.','bridge_outcome_unknown');}
 if(response.status>=300&&response.status<400)fail(502,'The bridge did not confirm this request. Check status before retrying.','bridge_outcome_unknown');
 if(config.mode==='legacy'&&!response.ok)fail(502,'The bridge did not confirm this request. Check status before retrying.','bridge_outcome_unknown');
 let rpc;try{
  const reader=response.body?.getReader();if(!reader)throw new Error();let size=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072){await reader.cancel();throw new Error();}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  rpc=JSON.parse(new TextDecoder().decode(bytes));
 }catch{fail(502,'The bridge returned an unreadable receipt. Check status before retrying.','bridge_receipt_invalid');}
 if(config.mode==='app_hmac'){
  if(response.status===409&&rpc?.ok===false&&rpc.reason==='operation_rejected')bridgeFailure(typeof rpc.error==='string'?rpc.error:'');
  if(!response.ok)fail(502,'The bridge did not confirm this request. Check status before retrying.','bridge_outcome_unknown');
  if(rpc?.ok!==true||!rpc.data||typeof rpc.data!=='object'||Array.isArray(rpc.data))fail(502,'The bridge returned an unreadable receipt. Check status before retrying.','bridge_receipt_invalid');
  return action==='readiness'?safeReadiness(rpc.data):safeReceipt(rpc.data,action.startsWith('conference_'));
 }
 if(rpc.jsonrpc!=='2.0'||rpc.id!==1||!Array.isArray(rpc.result?.content))fail(502,'The bridge returned an unreadable receipt. Check status before retrying.','bridge_receipt_invalid');
 const value=rpc.result.content.find(x=>x?.type==='text')?.text;
 if(rpc.result.isError)bridgeFailure(typeof value==='string'?value:'');
 let data;try{data=JSON.parse(value);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();}catch{fail(502,'The bridge returned an unreadable receipt. Check status before retrying.','bridge_receipt_invalid');}
 return action==='readiness'?safeReadiness(data):safeReceipt(data,action.startsWith('conference_'));
}
export async function handleCommunications(request,env,options={}){
 try{
  if(request.method!=='POST')fail(405,'Use a same-origin POST request.','method_not_allowed');
  const input=await readBody(request),user=await requireMember(request,env);
  // A new Supabase owner is not the old Sites owner. Outbound calling stays
  // blocked until an explicit audited cross-identity call capability exists.
  if(env.MIGRATED_IDENTITY)fail(503,'Calling is awaiting verification of this account with the existing phone service.','identity_mapping_required');
  if(user.role!=='owner'||user.status!=='active')fail(403,'Calling is available only to the account owner.','owner_required');
  if(!shape(input,['action','args'],['review_token'])||!actions.has(input.action)||!valid(input.action,input.args))fail(400,'Invalid communications request.','invalid_request');
  const config=binding(env),origin=new URL(request.url).origin,action=input.action;
  let reviewed;
  if(!['readiness','resume','prepare','conference_prepare'].includes(action))reviewed=await review(input.review_token,config.secret,user,origin,action,input.args);
  // Recheck active owner immediately before crossing the provider boundary.
  const current=await env.DB.prepare('SELECT role,status FROM members WHERE user_id=?').bind(user.user_id).first();
  if(current?.role!=='owner'||current.status!=='active')fail(403,'Account permissions changed. Reload before continuing.','owner_required');
  let saved=action==='readiness'?null:await readRecovery(env,user,origin);
  if(action==='resume'){
   if(!saved)return jsonResponse({ok:true,kind:null,data:null,review_token:null,recovery_pending:false});
   // Re-sign the same stored review; never extend its original dialing expiry.
   return jsonResponse({ok:true,kind:saved.record.kind,data:saved.record.data,review_token:await sign(saved.record.review,config.secret),recovery_pending:saved.record.pending===true});
  }
  if(['prepare','conference_prepare'].includes(action)&&saved&&unresolved(saved.record))fail(409,'Resume or end the existing call before preparing another.','call_unresolved');
  if(changing.has(action)){
   if(!saved||saved.record.review.id!==reviewed.id||saved.record.kind!==reviewed.kind)fail(409,'Resume or prepare this call in the app before continuing.','recovery_required');
   if(dialing.has(action)&&saved.record.pending)fail(409,'This call has an unconfirmed request. Check its status before retrying.','call_unresolved');
   const data=structuredClone(saved.record.data);
   if(dialing.has(action)){
    if(saved.record.kind==='call')data.state='submitting';
    else {data.steps[input.args.step-1].state='submitting';data.requires_reconciliation=true;}
   }else data.stop_requested=true;
   const record={...saved.record,data,pending:true};
   // Commit recovery information BEFORE any outbound provider-changing action.
   const version=await saveRecovery(env,user,record,saved.version);saved={record,version};
  }
  const data=await invoke(action,input.args,config,user,options.fetch||fetch);
  const result={ok:true,data};
  if(action==='prepare'||action==='conference_prepare'){
   const conference=action==='conference_prepare',kind=conference?'conference':'call';
   if(data.purpose!==input.args.purpose||(!conference&&(data.to!==input.args.to||data.mode!==input.args.mode))||(conference&&(data.steps[1].to!==input.args.recipients[0].to||data.steps[2].to!==input.args.recipients[1].to)))fail(502,'The bridge review did not match your request.','bridge_receipt_invalid');
   const expires=Math.min(Date.now()+600000,Number.isFinite(data.expires_at)?data.expires_at*1000:Infinity);
   const payload={v:'xtreme-review-1',owner:user.user_id,origin,kind,id:data[kind+'_id'],purpose:data.purpose,to:data.to,steps:conference?data.steps.map(s=>({step:s.step,to:s.to})):undefined,expires};
   result.review_token=await sign(payload,config.secret);
   await saveRecovery(env,user,{kind,data,review:payload,review_token:result.review_token,pending:false},saved?.version??null);
  }else if(reviewed){
   const kind=action.startsWith('conference_')?'conference':'call';
   if(data[kind+'_id']!==reviewed.id||data.purpose!==reviewed.purpose||(kind==='call'&&data.to!==reviewed.to)||(kind==='conference'&&data.steps.some((s,i)=>s.to!==reviewed.steps[i]?.to)))fail(502,'The bridge returned a different call receipt.','bridge_receipt_invalid');
   if(saved?.record.review.id===reviewed.id&&saved.record.kind===kind){
    // A status request may overtake an outbound request in transit. A still-
    // prepared bridge row is not proof that the in-flight submission cannot dial.
    // Retain its durable lock until a submitted/terminal receipt or explicit
    // cancellation resolves it; do not let a second tab replace its recovery.
    const unsubmittedSnapshot=saved.record.pending&&['status','conference_status'].includes(action)&&
     (kind==='call'?data.state==='prepared':!data.ended&&saved.record.data.steps.some((step,i)=>ACTIVE.has(step.state)&&data.steps[i].state==='planned'));
    const durableData=unsubmittedSnapshot?saved.record.data:data;
    if(unsubmittedSnapshot){result.data=durableData;result.recovery_pending=true;}
    // A concurrent operation or a failed receipt write must leave the earlier
    // durable submitting record intact. The bridge remains the source of truth.
    try{await saveRecovery(env,user,{...saved.record,data:durableData,pending:Boolean(unsubmittedSnapshot)},saved.version);}catch{result.recovery_pending=true;}
   }
  }
  return jsonResponse(result);
 }catch(error){return jsonResponse({ok:false,error:error.status?error.message:'The communications service is temporarily unavailable.',code:error.code||'communications_unavailable'},error.status||503);}
}

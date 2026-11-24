import {storeAssistantActions,loadAssistantActionHistory} from './assistant-action-receipts.mjs';
import { requireMember, readBody, jsonResponse } from './accounts.mjs';
import { handleAssistantVoice } from './assistant-voice.mjs';
import { assistantPreferenceContext } from './assistant-preferences.mjs';
import { personalContextForUser } from './assistant-personalization.mjs';

const APP='appgprj_6aec7688554c819181a5cae574c92008';
const SERVICE='https://eden-skye-call-desk.strategic-ai.chatgpt.site';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
const fail=(status,message,code='request_failed')=>{throw Object.assign(new Error(message),{status,code});};
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
function config(env){
 if(env.MIGRATED_IDENTITY){if(!env.CHAT_V2_ENABLED||!env.ACCESS_TOKEN||!env.AUTH_USER?.id)fail(503,'AI Assist is awaiting its verified account connection.','service_unavailable');return {secret:null,token:null};}
 if(typeof env.XTREME_ASSISTANT_SECRET!=='string'||env.XTREME_ASSISTANT_SECRET.length<48||typeof env.ASSISTANT_SITES_TOKEN!=='string'||env.ASSISTANT_SITES_TOKEN.length<16||/[\r\n]/.test(env.ASSISTANT_SITES_TOKEN))fail(503,'AI Assist is awaiting its secure connection.','service_unavailable');
 return {secret:env.XTREME_ASSISTANT_SECRET,token:env.ASSISTANT_SITES_TOKEN};
}
export async function assistantServiceRequest(env,userId,path,payload,fetcher=fetch){
 if(!['/assistant/v1/status','/assistant/v1/chat'].includes(path))fail(404,'Not found.');
 const migrated=env.MIGRATED_IDENTITY===true;
 if(migrated&&(!env.CHAT_V2_ENABLED||!env.ACCESS_TOKEN||env.AUTH_USER?.id!==userId))fail(503,'AI Assist is awaiting its verified account connection.','service_unavailable');
 if(migrated){
  let origin;try{origin=new URL(env.APP_ORIGIN);}catch{}
  if(!origin||origin.protocol!=='https:'||origin.origin!==env.APP_ORIGIN)fail(503,'AI Assist is awaiting its verified account connection.','service_unavailable');
 }
 const {secret,token}=migrated?{secret:null,token:null}:config(env),body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000)),nonce=crypto.randomUUID();
 // Stable opaque namespace: never forward the user's email or a browser-supplied ID.
 const subject=migrated?null:await hmac(secret,JSON.stringify(['xtreme-assistant-user-v1',APP,userId]));
 const canonical=JSON.stringify(['xtreme-assistant-v1',APP,subject,'POST',path,timestamp,nonce,await digest(body)]);
 let response;
 try{response=await fetcher(migrated?'https://eden-outbound-call-sandbox-code.up.railway.app/xtreme/v2/'+(path.endsWith('/chat')?'chat':'status'):SERVICE+path,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(path.endsWith('/chat')?75000:15000),headers:migrated?{'content-type':'application/json','accept':'application/json','Authorization':'Bearer '+env.ACCESS_TOKEN,'Origin':env.APP_ORIGIN}:{'content-type':'application/json','accept':'application/json','OAI-Sites-Authorization':'Bearer '+token,'X-Xtreme-App-Id':APP,'X-Xtreme-User-Id':subject,'X-Xtreme-Timestamp':timestamp,'X-Xtreme-Nonce':nonce,'X-Xtreme-Signature':await hmac(secret,canonical)},body});}
 catch{fail(502,'The assistant has not confirmed this message yet. Retry this same message to check its result.','outcome_unknown');}
 if(response.status>=300&&response.status<400)fail(503,'The assistant service could not be reached securely.','service_unavailable');
 // Bound bytes before decoding; an upstream error must not allocate an
 // unbounded response or expose provider text in the user's app.
 let raw;
 try{
  const reader=response.body?.getReader(),chunks=[];let size=0;
  if(!reader)throw Error('empty_response');
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw Error('large_response');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }catch{fail(502,'The assistant returned an unreadable response. Retry to check this message.','outcome_unknown');}
 if(raw.length>65536)fail(502,'The assistant returned an unreadable response. Retry to check this message.','outcome_unknown');
 let data;try{data=JSON.parse(raw);}catch{fail(502,'The assistant returned an unreadable response. Retry to check this message.','outcome_unknown');}
 if(!response.ok){
  const pending=['request_pending','in_progress'].includes(data?.code);
  // V2 explicitly distinguishes durable final results from unknown outcomes.
  // Never infer finality from a timeout/status code or a fresh auth rejection.
  const definite=migrated?(path==='/assistant/v1/chat'&&data?.ok===false&&data?.terminal===true&&data?.requestId===payload.requestId):(data?.terminal===true||['quota_exceeded','daily_limit','rate_limited','provider_rejected','provider_failed','provider_timeout','inference_failed'].includes(data?.code));
  const error=new Error(pending?'This message is still being answered. Retry in a moment.':response.status===429?'The assistant usage allowance has been reached. Try again later.':definite?'This message could not be answered. Your draft has been kept.':'The assistant has not confirmed this message. Retry to check its result.');
  Object.assign(error,{status:response.status===429?429:pending?409:503,code:pending?'request_pending':definite?'request_failed':'outcome_unknown',terminal:definite});throw error;
 }
 return data;
}
async function schema(db){
 await db.prepare(`CREATE TABLE IF NOT EXISTS assistant_turns (user_id TEXT NOT NULL, request_id TEXT NOT NULL, prompt TEXT NOT NULL, context_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','complete','failed')), reply TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,request_id))`).run();
 await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS assistant_one_pending ON assistant_turns(user_id) WHERE status='pending'`).run();
}
async function history(db,id){
 const rows=await db.prepare("SELECT request_id,prompt,reply,created_at,updated_at FROM assistant_turns WHERE user_id=? AND status='complete' ORDER BY created_at DESC,request_id DESC LIMIT 50").bind(id).all();
 const effects=await loadAssistantActionHistory(db,id);
 return rows.results.reverse().flatMap(row=>[{id:row.request_id+'-user',role:'user',content:row.prompt,createdAt:row.created_at},{id:row.request_id+'-assistant',role:'assistant',content:row.reply,createdAt:row.updated_at,...(effects.get(row.request_id)?.length?{actions:effects.get(row.request_id)}:{})}]);
}
async function active(db,id){return await db.prepare("SELECT request_id,prompt FROM assistant_turns WHERE user_id=? AND status='pending' LIMIT 1").bind(id).first();}
async function verifyActive(db,id){if(!await db.prepare("SELECT user_id FROM members WHERE user_id=? AND status='active'").bind(id).first())fail(403,'Account access has changed. Sign in again.','account_changed');}
function contextFor(messages,prompt,preferences){
 const pairs=[];let chars=prompt.length+preferences.length;
 // One preference message, whole history pairs, and the raw new prompt stay
 // within the existing service contract (20 messages / 16,000 characters).
 for(let i=messages.length-2;i>=0&&pairs.length<18;i-=2){const pair=messages.slice(i,i+2);const length=pair.reduce((sum,m)=>sum+m.content.length,0);if(chars+length>15000||pair.some(m=>m.content.length>8000))break;pairs.unshift(...pair.map(({role,content})=>({role,content})));chars+=length;}
 return [{role:'user',content:preferences},...pairs,{role:'user',content:prompt}];
}
export async function handleAssistant(request,env,fetcher=fetch){
 if(new URL(request.url).pathname.startsWith('/api/assistant/voice/'))return handleAssistantVoice(request,env,fetcher);
 try{
  const url=new URL(request.url),path=url.pathname;
  if(!['/api/assistant/status','/api/assistant/chat'].includes(path)||url.search)return jsonResponse({error:'Not found.'},404);
  if(!['GET','POST'].includes(request.method)||(path.endsWith('/status')&&request.method!=='GET'))return jsonResponse({error:'Method not allowed.'},405);
  const input=request.method==='POST'?await readBody(request):null,user=await requireMember(request,env),db=env.DB;
  // Read requests are fenced too: an old tab must never render the new cookie
  // account's history while it still displays the previous account's identity.
  if(request.headers.get('x-xtreme-account')!==user.user_id)fail(409,'Your signed-in account changed. Reload before continuing.','account_changed');
  if(path.endsWith('/status')){
   try{
    const data=await assistantServiceRequest(env,user.user_id,'/assistant/v1/status',{},fetcher);
    await verifyActive(db,user.user_id);
    return jsonResponse({chat:{ready:data.chat?.ready===true,toolsEnabled:data.chat?.toolsEnabled===true,externalActions:false,reason:data.chat?.ready===true?'':'AI Assist is awaiting its secure connection.'},voice:{ready:false,reason:'Live voice is being connected to your approved voice engine.'}});
   }catch(error){return jsonResponse({chat:{ready:false,toolsEnabled:false,externalActions:false,reason:error.status===403?'Account access has changed.':'AI Assist is awaiting its secure connection.'},voice:{ready:false,reason:'Live voice is being connected to your approved voice engine.'}},error.status===403?403:200);}
  }
  await schema(db);
  if(request.method==='GET'){
   const messages=await history(db,user.user_id),pending=await active(db,user.user_id);
   return jsonResponse({messages,pending:!!pending,pendingRequest:pending?{requestId:pending.request_id,message:pending.prompt}:null});
  }
  if(!input||Object.keys(input).sort().join(',')!=='message,requestId'||!UUID.test(input.requestId)||typeof input.message!=='string'||!input.message.trim()||input.message.length>4000||/[\u0000]/.test(input.message))fail(400,'Write a message of up to 4,000 characters.','invalid_request');
  config(env);
  let row=await db.prepare('SELECT * FROM assistant_turns WHERE user_id=? AND request_id=?').bind(user.user_id,input.requestId).first();
  if(row&&row.prompt!==input.message)fail(409,'This request belongs to a different message.','request_conflict');
  if(row?.status==='complete'){const messages=await history(db,user.user_id),actions=messages.find(m=>m.id===input.requestId+'-assistant')?.actions||[];return jsonResponse({ok:true,requestId:input.requestId,reply:row.reply,messages,...(actions.length?{actions}:{})});}
  if(row?.status==='failed')fail(503,'This message could not be answered. Your draft has been kept.','request_failed');
  if(!row){
   const pending=await active(db,user.user_id);if(pending)fail(409,'Finish checking your previous message before sending another.','request_pending');
   const selected=await assistantPreferenceContext(db,user.user_id);
   const personal=await personalContextForUser(env,user.user_id,fetcher);
   const preferences=selected+(personal?'\n\n'+personal.text:'');
   if(preferences.length>8000)fail(503,'Your personal context is too large for this conversation.','personal_context_unavailable');
   const messages=contextFor(await history(db,user.user_id),input.message,preferences),now=new Date().toISOString();
   const inserted=await db.prepare("INSERT OR IGNORE INTO assistant_turns(user_id,request_id,prompt,context_json,status,created_at,updated_at) SELECT ?,?,?,?,'pending',?,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(user.user_id,input.requestId,input.message,JSON.stringify(messages),now,now,user.user_id).run();
   row=await db.prepare('SELECT * FROM assistant_turns WHERE user_id=? AND request_id=?').bind(user.user_id,input.requestId).first();
   if(!row||!inserted.meta?.changes){if(!row)fail(409,'Another message is being answered. Retry to check its result.','request_pending');if(row.prompt!==input.message)fail(409,'This request belongs to a different message.','request_conflict');}
  }
  await verifyActive(db,user.user_id);
  let result;
  try{result=await assistantServiceRequest(env,user.user_id,'/assistant/v1/chat',{requestId:input.requestId,messages:JSON.parse(row.context_json)},fetcher);}
  catch(error){if(error.terminal)await db.prepare("UPDATE assistant_turns SET status='failed',updated_at=? WHERE user_id=? AND request_id=? AND status='pending'").bind(new Date().toISOString(),user.user_id,input.requestId).run();throw error;}
  if(result.ok!==true||result.requestId!==input.requestId||typeof result.reply!=='string'||!result.reply.trim()||result.reply.length>12000)fail(502,'The assistant returned an unreadable answer. Retry to check this message.','outcome_unknown');
  const actions=await storeAssistantActions(db,user.user_id,input.requestId,result.actions);
  await db.prepare("UPDATE assistant_turns SET status='complete',reply=?,updated_at=? WHERE user_id=? AND request_id=? AND status='pending'").bind(result.reply,new Date().toISOString(),user.user_id,input.requestId).run();
  await verifyActive(db,user.user_id);
  return jsonResponse({ok:true,requestId:input.requestId,reply:result.reply,messages:await history(db,user.user_id),...(actions.length?{actions}:{})});
 }catch(error){return jsonResponse({error:error.status?error.message:'AI Assist is temporarily unavailable.',code:error.code||'service_unavailable',...(error.terminal||error.code==='request_failed'?{terminal:true}:{})},error.status||503);}
}
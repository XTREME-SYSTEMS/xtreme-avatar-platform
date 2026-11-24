import {utcInstant} from './google-workspace-proxy.mjs';
// Authenticated runtime effects are data, never executable code or write approval.
const V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID=/^[A-Za-z0-9_-]{1,256}$/,REF=/^ce1_[0-9a-f]{64}$/;
const SCREENS=new Set(['home','voice','messages','models','connections','workspace','projects','results','briefing','bid','leads','calendar']);
const KEY='assistant_actions_v1:',enc=new TextEncoder();
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const shape=(v,k)=>plain(v)&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const txt=(v,n,m=false)=>typeof v==='string'&&v.length<=n&&!(m?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v);
function invalid(){throw Object.assign(new Error('The assistant action could not be verified. Check this message again.'),{status:502,code:'outcome_unknown'});}
const instant=v=>utcInstant(v)??NaN;
function day(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return NaN;const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v?+d:NaN;}
export function validateAssistantActions(value,{max=4,now=Date.now(),history=false,retainExpired=false}={}){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>max||enc.encode(JSON.stringify(value)).byteLength>24000)invalid();
 const seen=new Set(),result=[];
 for(const a of value){
  if(!plain(a)||!V4.test(a.id||'')||seen.has(a.id))invalid();seen.add(a.id);
  if(a.kind==='navigate'){
   if(!shape(a,['id','kind','screen'])||!SCREENS.has(a.screen))invalid();
   result.push({id:a.id,kind:a.kind,screen:a.screen});continue;
  }
  if(a.kind==='saved'){
   if(!shape(a,['id','kind','resource','itemId','title'])||!['task','result','job'].includes(a.resource)||typeof a.itemId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(a.itemId)||!txt(a.title,200)||!a.title.trim())invalid();
   result.push({id:a.id,kind:a.kind,resource:a.resource,itemId:a.itemId,title:a.title});continue;
  }
  if(a.kind!=='calendar_review'||!shape(a,['id','kind','connectionRevision','review'])||!Number.isSafeInteger(a.connectionRevision)||a.connectionRevision<1)invalid();
  const r=a.review;
  if(!shape(r,['state','requestId','reviewToken','expiresAt','action','eventId','eventRef','draft','defaults'])||r.state!=='review'||r.requestId!==a.id||!V4.test(r.requestId||'')||!['create','update'].includes(r.action)||typeof r.reviewToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(r.reviewToken)||!(r.eventId===null||ID.test(r.eventId||''))||!(r.eventRef===null||REF.test(r.eventRef||''))||(r.action==='create'&&(r.eventId!==null||r.eventRef!==null))||(r.action==='update'&&(!r.eventId||!r.eventRef)))invalid();
  const expiry=instant(r.expiresAt);
  if(typeof r.expiresAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.expiresAt)||!Number.isFinite(expiry)||expiry>now+11*60000)invalid();
  const d=r.draft;
  if(!shape(d,['title','notes','location','start','end','allDay','timeZone'])||!txt(d.title,200)||!d.title.trim()||!txt(d.notes,4000,true)||!txt(d.location,300)||typeof d.allDay!=='boolean'||!txt(d.timeZone,100))invalid();
  try{new Intl.DateTimeFormat('en',{timeZone:d.timeZone});}catch{invalid();}
  const s=d.allDay?day(d.start):instant(d.start),e=d.allDay?day(d.end):instant(d.end);
  if(!Number.isFinite(s)||!Number.isFinite(e)||e<=s||e-s>366*86400000||s<Date.parse('2000-01-01T00:00:00Z')||e>Date.parse('2101-01-01T00:00:00Z'))invalid();
  if(!shape(r.defaults,['visibility','notifications','reminders'])||r.defaults.visibility!=='private'||r.defaults.notifications!==false||r.defaults.reminders!==false)invalid();
  if(expiry<=now&&!retainExpired){if(history)continue;invalid();}
  result.push({id:a.id,kind:a.kind,connectionRevision:a.connectionRevision,review:{state:'review',requestId:r.requestId,reviewToken:r.reviewToken,expiresAt:r.expiresAt,action:r.action,eventId:r.eventId,eventRef:r.eventRef,draft:{...d},defaults:{visibility:'private',notifications:false,reminders:false}}});
 }
 return result;
}
function storedReceipt(value,now){
 const raw=JSON.parse(value),legacy=Array.isArray(raw);
 if(!legacy&&!shape(raw,['actions','retiredReviewIds']))invalid();
 const actions=validateAssistantActions(legacy?raw:raw.actions,{now,retainExpired:true}),retired=legacy?[]:raw.retiredReviewIds;
 if(!Array.isArray(retired)||retired.length>4||new Set(retired).size!==retired.length||retired.some(id=>!V4.test(id)||!actions.some(a=>a.id===id&&a.kind==='calendar_review')))invalid();
 return {actions,retiredReviewIds:retired};
}
function reconcile(original,current){
 // A fresh runtime replay can withdraw stale reviews. It cannot change/add
 // effects or omit confirmed task/result/navigation receipts.
 let next=0;const retired=new Set(original.retiredReviewIds);
 for(const previous of original.actions){
  if(current[next]?.id===previous.id){if(JSON.stringify(previous)!==JSON.stringify(current[next]))invalid();next++;}
  else if(previous.kind==='calendar_review')retired.add(previous.id);
  else invalid();
 }
 if(next!==current.length)invalid();
 return {actions:original.actions,retiredReviewIds:[...retired].sort()};
}
export async function storeAssistantActions(db,userId,requestId,value,{now=Date.now()}={}){
 if(!V4.test(requestId||''))invalid();
 const current=validateAssistantActions(value,{now,retainExpired:true}),key=KEY+requestId;
 const initial=JSON.stringify({actions:current,retiredReviewIds:[]});
 await db.prepare("INSERT OR IGNORE INTO private_state(user_id,key,value,version,updated_at) SELECT ?,?,?,1,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(userId,key,initial,new Date().toISOString(),userId).run();
 let selected;
 for(let attempt=0;attempt<3;attempt++){
  const row=await db.prepare('SELECT value,version FROM private_state WHERE user_id=? AND key=?').bind(userId,key).first();if(!row)invalid();
  const original=storedReceipt(row.value,now),updated=reconcile(original,current),serialized=JSON.stringify(updated);
  if(serialized!==row.value){
   const changed=await db.prepare("UPDATE private_state SET value=?,version=version+1,updated_at=? WHERE user_id=? AND key=? AND version=? AND value=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(serialized,new Date().toISOString(),userId,key,row.version,row.value,userId).run();
   if(changed.meta?.changes!==1)continue;
  }
  selected=updated;break;
 }
 if(!selected)invalid();
 await db.prepare("DELETE FROM private_state WHERE user_id=? AND key LIKE ? AND key NOT IN (SELECT key FROM private_state WHERE user_id=? AND key LIKE ? ORDER BY updated_at DESC,key DESC LIMIT 50)").bind(userId,KEY+'%',userId,KEY+'%').run();
 return validateAssistantActions(current.filter(a=>!selected.retiredReviewIds.includes(a.id)),{now,history:true});
}
export async function loadAssistantActionHistory(db,userId){
 const rows=await db.prepare('SELECT key,value FROM private_state WHERE user_id=? AND key LIKE ? ORDER BY updated_at DESC,key DESC LIMIT 50').bind(userId,KEY+'%').all(),result=new Map(),now=Date.now();
 for(const row of rows.results||[]){
  try{const rid=String(row.key).slice(KEY.length);if(!V4.test(rid))continue;const stored=storedReceipt(row.value,now);result.set(rid,validateAssistantActions(stored.actions.filter(a=>!stored.retiredReviewIds.includes(a.id)),{now,history:true}));}catch{/* Invalid private history never becomes an executable effect. */}
 }
 return result;
}

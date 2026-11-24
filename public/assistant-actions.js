/* Only account-scoped action receipts from authenticated app responses reach this bridge. */
(()=>{
'use strict';
if(window.XtremeAssistantActions)return;
const account=window.XtremeAccount,owner=account?.user?.id;
if(!owner||account.locked)return;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const screens=Object.freeze({home:'Home',voice:'Voice',messages:'Chat',workspace:'Tasks',projects:'Job folders',results:'Results',briefing:'Today’s briefing',connections:'Connected apps',models:'AI avatars',leads:'Auto Leads',bid:'Bid generator',calendar:'Calendar'});
const savedScreens={task:'workspace',job:'projects',result:'results'},seen=new Set();
let ended=false,epoch=0,noticeTimer=null,pendingReview=null;
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
function active(){if(ended||account.locked)return false;if(account.user?.id!==owner){account.invalidate?.('Your signed-in account changed. Reload to open the correct account.');return false;}return true;}
function validate(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.id!=='string'||!UUID.test(value.id))return null;
 if(value.kind==='navigate'&&Object.hasOwn(screens,value.screen))return {id:value.id,kind:value.kind,screen:value.screen};
 if(value.kind==='saved'&&Object.hasOwn(savedScreens,value.resource)&&text(value.title,240)&&typeof value.itemId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value.itemId))return {id:value.id,kind:value.kind,resource:value.resource,itemId:value.itemId,title:value.title};
 if(value.kind!=='calendar_review'||!Number.isSafeInteger(value.connectionRevision)||value.connectionRevision<1)return null;
 const r=value.review,d=r?.draft,defaults=r?.defaults;
 if(!r||r.state!=='review'||!['create','update'].includes(r.action)||r.requestId!==value.id||typeof r.reviewToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(r.reviewToken)||typeof r.expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.expiresAt)||!Number.isFinite(Date.parse(r.expiresAt))||!d||typeof d!=='object'||typeof d.allDay!=='boolean'||!text(d.title,200)||!d.title.trim()||!text(d.notes??'',4000)||!text(d.location??'',300)||!text(d.start,80)||!text(d.end,80)||!text(d.timeZone,120)||defaults?.visibility!=='private'||defaults.notifications!==false||defaults.reminders!==false)return null;
 if(r.action==='create'&&(r.eventId!==null||r.eventRef!==null))return null;
 if(r.action==='update'&&(typeof r.eventId!=='string'||r.eventId.length<1||r.eventId.length>256||/[^\x21-\x7e]/.test(r.eventId)||typeof r.eventRef!=='string'||!/^ce1_[0-9a-f]{64}$/.test(r.eventRef)))return null;
 return {id:value.id,kind:value.kind,connectionRevision:value.connectionRevision,review:{state:'review',requestId:r.requestId,reviewToken:r.reviewToken,expiresAt:r.expiresAt,action:r.action,...(r.eventId!==undefined?{eventId:r.eventId}:{}),...(r.eventRef!==undefined?{eventRef:r.eventRef}:{}),draft:{title:d.title,notes:d.notes??'',location:d.location??'',start:d.start,end:d.end,allDay:d.allDay,timeZone:d.timeZone},defaults:{visibility:'private',notifications:false,reminders:false}}};
}
function list(values){return Array.isArray(values)&&values.length<=12?values.map(validate).filter(Boolean):[];}
function node(tag,className,value){const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)n.textContent=value;return n;}
function notify(message){
 if(!active())return;let box=document.querySelector('#assistant-action-notice');
 if(!box){box=node('div','assistant-action-notice');box.id='assistant-action-notice';box.setAttribute('role','status');box.setAttribute('aria-live','polite');document.body.append(box);}
 box.textContent=message;clearTimeout(noticeTimer);
 if(pendingReview){const action=pendingReview,retry=node('button','silver-button','Review appointment');retry.type='button';retry.addEventListener('click',async()=>{if(retry.disabled||!active())return;retry.disabled=true;try{await open(action);}finally{if(active())retry.disabled=false;}});box.append(retry);}
 else noticeTimer=setTimeout(()=>box.remove(),7000);
}
function expired(action){return action.kind==='calendar_review'&&Date.parse(action.review.expiresAt)<=Date.now();}
async function open(action){
 if(!active())return false;
 if(action.kind==='navigate'){location.hash='#'+action.screen;return true;}
 if(action.kind==='saved'){location.hash='#'+savedScreens[action.resource];return true;}
 if(expired(action)){if(pendingReview?.id===action.id)pendingReview=null;notify('This appointment review expired. Ask the assistant to prepare it again.');return false;}
 const calendar=window.XtremeJobCalendar;
 if(typeof calendar?.showPreparedReview!=='function'){pendingReview=action;notify('Calendar is still loading. Use Review appointment to try again when it is ready.');return false;}
 const run=epoch;
 try{const result=await calendar.showPreparedReview({connectionRevision:action.connectionRevision,review:action.review});if(!active()||epoch!==run)return false;if(result===false){pendingReview=action;notify('Calendar could not verify this review. Check your connection, then review it again.');return false;}if(pendingReview?.id===action.id){pendingReview=null;document.querySelector('#assistant-action-notice')?.remove();}return true;}
 catch{if(active()&&epoch===run){pendingReview=action;notify('The appointment review could not be opened. Check Calendar and try again.');}return false;}
}
function render(values){
 const group=node('div','assistant-action-receipts');if(!active())return group;
 for(const action of list(values)){
  const card=node('section','assistant-action-receipt'),button=node('button','silver-button');button.type='button';
  if(action.kind==='calendar_review'){
   card.append(node('strong','',action.review.action==='update'?'Appointment change ready to review':'Appointment ready to review'),node('p','',action.review.draft.title),node('small','',action.review.draft.start+' → '+action.review.draft.end+' · '+action.review.draft.timeZone));
   button.textContent=expired(action)?'Review expired':'Review appointment';button.disabled=expired(action);
  }else if(action.kind==='saved'){
   card.append(node('strong','',action.resource==='job'?'Job saved':action.resource==='result'?'Result saved':'Task saved'),node('p','',action.title));button.textContent='View '+(action.resource==='job'?'job folders':action.resource==='result'?'results':'tasks');
  }else {card.append(node('strong','','Open '+screens[action.screen]));button.textContent='Open '+screens[action.screen];}
  button.addEventListener('click',async()=>{if(button.disabled||!active())return;button.disabled=true;try{await open(action);}finally{if(active())button.disabled=expired(action);}});
  card.append(button);group.append(card);
 }
 return group;
}
function receive(values,context={}){
 if(!active()||!['chat','voice'].includes(context.source)||typeof context.requestId!=='string'||!UUID.test(context.requestId))return;
 const actions=list(values),fresh=actions.filter(action=>!seen.has(action.id));
 for(const action of fresh){seen.add(action.id);if(seen.size>200)seen.delete(seen.values().next().value);}
 if(context.automatic!==true)return;
 // Only the first route/review is opened; repeated status/history reads cannot navigate again.
 const target=fresh.find(action=>action.kind==='calendar_review')||fresh.find(action=>action.kind==='navigate');
 if(target)void open(target);
 const saved=fresh.filter(action=>action.kind==='saved');if(saved.length)notify(saved.length===1?(saved[0].resource==='task'?'Task saved: ':saved[0].resource==='job'?'Job saved: ':'Result saved: ')+saved[0].title:saved.length+' items saved. Open Tasks or Results to review them.');
}
function end(){ended=true;epoch++;seen.clear();pendingReview=null;clearTimeout(noticeTimer);document.querySelector('#assistant-action-notice')?.remove();}
window.XtremeAssistantActions={render,receive};
window.addEventListener('xtreme:account-ended',end);window.addEventListener('pagehide',end);
window.addEventListener('pageshow',event=>{if(event.persisted&&!account.locked&&account.user?.id===owner){ended=false;epoch++;}});
window.dispatchEvent(new Event('xtreme:assistant-actions-ready'));
})();

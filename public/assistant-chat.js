/* Same-origin, account-scoped AI chat. No provider credentials or browser storage. */
(()=>{
'use strict';
if(window.XtremeAssistantChat)return;
const account=window.XtremeAccount,draft=window.XtremeChatDraft,owner=account?.user?.id;
if(!owner||!draft||account.locked)return;
const controllers=new Set(),emptyViews=new WeakMap(),renderedViews=new WeakMap(),MAX=4000;
let ended=false,ready=false,historyReady=false,loading=false,busy=false,messages=[],pending=null,unknownPending=false,conflicted=false,notice='',generation=0,liveActions=null;
const $=selector=>document.querySelector(selector);
function current(){
 if(ended||account.locked)return false;
 if(account.user?.id!==owner){account.invalidate?.('Your signed-in account changed. Reload to open the correct account.');return false;}
 return true;
}
async function request(path,body){
 if(!current())throw new Error('Account session ended.');
 const controller=new AbortController();controllers.add(controller);
 const timer=setTimeout(()=>controller.abort(),body?75000:12000);
 try{
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'X-Xtreme-Account':owner,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();
  if(!current())throw new Error('Account session ended.');
  if(!response.ok){
   if(result.code==='account_changed'||[401,403].includes(response.status))account.invalidate?.(result.error||'Please sign in again.',response.status===401);
   const error=new Error(typeof result.error==='string'?result.error.slice(0,240):'AI Assist could not complete the request.');error.code=result.code;error.status=response.status;error.terminal=result.terminal===true||result.code==='invalid_request';throw error;
  }
  return result;
 }finally{clearTimeout(timer);controllers.delete(controller);}
}
function readMessages(value){
 if(!Array.isArray(value))throw new Error('Conversation history could not be read.');
 return value.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&typeof m.id==='string').map(m=>({id:m.id,role:m.role,content:m.content,createdAt:m.createdAt,...(m.role==='assistant'&&Array.isArray(m.actions)&&m.actions.length<=4?{actions:m.actions}:{})}));
}
function deliverActions(){if(current()&&liveActions&&window.XtremeAssistantActions){const value=liveActions;liveActions=null;window.XtremeAssistantActions.receive(value.actions,{source:'chat',requestId:value.requestId,automatic:true});}}
function readPending(value){
 return value&&typeof value.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId)&&typeof value.message==='string'&&value.message.trim()&&value.message.length<=MAX?{requestId:value.requestId,message:value.message}:null;
}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function render(){
 if(!current()||!$('#assistant-chat-form'))return;
 const connection=$('#assistant-chat-connection'),send=$('.assistant-chat-send'),body=$('.assistant-chat-body');
 if(body&&!emptyViews.has(body))emptyViews.set(body,body.innerHTML);
 if(connection){const indicator=node('span');indicator.setAttribute('aria-hidden','true');connection.replaceChildren(indicator,document.createTextNode(busy?'AI Assist is thinking…':ready&&historyReady?'Connected · AI chat':loading?'Connecting AI Assist…':'AI chat unavailable'));}
 if(send){send.disabled=!ready||!historyReady||busy||loading||Boolean(pending)||unknownPending||!draft.value.trim();send.setAttribute('aria-label',busy?'AI Assist is replying':'Send message');send.title=send.disabled?'Wait for the connection or current reply':'Send message';}
 const previous=body&&renderedViews.get(body),changed=!previous||previous.messages!==messages||previous.pending!==pending||previous.busy!==busy||previous.actionBridge!==window.XtremeAssistantActions;
 if(body&&changed&&(messages.length||pending)){
  body.replaceChildren();
  const transcript=node('div','assistant-chat-transcript');transcript.setAttribute('role','log');transcript.setAttribute('aria-label','Private conversation');
  for(const message of messages){const turn=node('article','assistant-chat-turn assistant-chat-turn-'+message.role);turn.append(node('strong','assistant-chat-speaker',message.role==='user'?'You':'AI Assist'),node('p','assistant-chat-text',message.content));if(message.role==='assistant'&&message.actions?.length&&window.XtremeAssistantActions)turn.append(window.XtremeAssistantActions.render(message.actions));transcript.append(turn);}
  if(pending){const turn=node('article','assistant-chat-turn assistant-chat-turn-user');turn.append(node('strong','assistant-chat-speaker','You'),node('p','assistant-chat-text',pending.message),node('small','assistant-chat-pending',busy?'Waiting for AI Assist…':'Reply not confirmed'));transcript.append(turn);}
  body.append(transcript);
 }else if(!messages.length&&!pending){
  // Restore only this screen's original static empty-state markup, never message HTML.
  if(body)body.innerHTML=emptyViews.get(body);
  const note=$('.assistant-chat-empty-note');if(note)note.textContent=ready&&historyReady?'Ask a question or describe what you need. Chat can help you draft and plan; calls and email actions are not connected here.':loading?'Connecting your private conversation…':'Your draft stays here while AI Assist is unavailable.';
 }
 if(body)renderedViews.set(body,{messages,pending,busy,actionBridge:window.XtremeAssistantActions});
 let status=$('#assistant-chat-runtime');
 if(!status){status=node('div','assistant-chat-runtime');status.id='assistant-chat-runtime';status.setAttribute('role','status');status.setAttribute('aria-live','polite');$('#assistant-chat-form').append(status);}
 status.replaceChildren();
 if(busy)status.append(node('p','','Thinking… You can keep editing your next message.'));
 else if(notice)status.append(node('p','',notice));
 if(!busy&&!loading&&(pending||unknownPending||!ready||!historyReady)){
  const button=node('button','silver-button',pending&&!conflicted?'Retry this message':'Check connection');button.type='button';button.setAttribute('data-assistant-chat-retry','');status.append(button);
 }
}
async function refresh(){
 if(!current()||loading||busy)return;
 loading=true;notice='';const run=++generation;render();
 const results=await Promise.allSettled([request('/api/assistant/status'),request('/api/assistant/chat')]);
 if(!current()||run!==generation)return;
 const [status,history]=results;
 ready=status.status==='fulfilled'&&status.value?.chat?.ready===true;
 if(status.status==='rejected')notice='AI Assist could not connect. Check your connection and try again.';
 else if(!ready)notice=typeof status.value?.chat?.reason==='string'?status.value.chat.reason.slice(0,240):'AI Assist is not available yet.';
 if(history.status==='fulfilled'){
  try{const earlier=pending;messages=readMessages(history.value.messages);pending=readPending(history.value.pendingRequest);unknownPending=history.value.pending===true&&!pending;conflicted=false;historyReady=true;if(earlier&&messages.some(m=>m.id===earlier.requestId+'-assistant'))draft.sent(earlier.message);if(pending||unknownPending)notice='An earlier reply is not confirmed yet. Check or retry it before sending another message.';}catch{historyReady=false;notice='Your conversation could not be read. Check the connection before sending.';}
 }else{historyReady=false;notice='Your conversation could not be loaded. Your draft has not been sent.';}
 loading=false;render();
}
async function submit(){
 if(!current()||busy||loading)return;
 if(!ready||!historyReady){notice='AI Assist is not connected. Your draft has not been sent.';render();return;}
 if(unknownPending){await refresh();return;}
 if(!pending){const message=draft.value;if(!message.trim()||message.length>MAX)return;pending={requestId:crypto.randomUUID(),message};}
 const submitted={...pending},run=++generation;busy=true;notice='';render();
 try{
  const result=await request('/api/assistant/chat',submitted);
  if(!current()||run!==generation)return;
  if(result.ok!==true||result.requestId!==submitted.requestId)throw new Error('The reply could not be confirmed.');
  const complete=readMessages(result.messages);
  if(typeof result.reply!=='string'||!result.reply.trim()||!complete.some(m=>m.id===submitted.requestId+'-assistant'&&m.role==='assistant'&&m.content===result.reply))throw new Error('The reply could not be confirmed.');
  if(Array.isArray(result.actions)&&result.actions.length<=4){const turn=complete.find(m=>m.id===submitted.requestId+'-assistant');if(turn)turn.actions=result.actions;liveActions={requestId:submitted.requestId,actions:result.actions};}
  messages=complete;pending=null;unknownPending=false;notice='';draft.sent(submitted.message);deliverActions();
 }catch(error){
  if(!current()||run!==generation)return;
  // Keep the original request ID after ambiguous failures to prevent duplicate charges.
  if(error.terminal){pending=null;notice=error.status===429?'AI Assist has reached its current limit. Your draft is kept; try again later.':'This message could not be answered. Your draft is kept; edit it or try again.';}
  else if(error.code==='request_conflict'||error.code==='request_pending'){conflicted=true;notice='An earlier message is still being checked. Check the connection before retrying.';}
  else notice=error.status===429?'AI Assist has reached its current limit. Try this same message again later.':error.status===503?'AI Assist is temporarily unavailable. Your message is kept for a safe retry.':'The reply could not be confirmed. Retry this message safely; your text is still here.';
 }finally{if(current()&&run===generation){busy=false;render();}}
}
function end(){ended=true;generation++;for(const controller of controllers)controller.abort();controllers.clear();messages=[];pending=null;liveActions=null;unknownPending=false;conflicted=false;ready=false;historyReady=false;loading=false;busy=false;notice='';$('.assistant-chat-body')?.replaceChildren();$('#assistant-chat-runtime')?.replaceChildren();}
window.XtremeAssistantChat={render,submit};
document.addEventListener('input',event=>{if(event.target.id==='assistant-chat-input')render();});
document.addEventListener('click',event=>{if(event.target.closest?.('[data-assistant-chat-retry]')){event.preventDefault();if(pending&&!conflicted&&ready&&historyReady)void submit();else void refresh();}else if(event.target.closest?.('[data-chat-prompt]'))render();});
window.addEventListener('xtreme:account-ended',end);
window.addEventListener('xtreme:assistant-actions-ready',()=>{if(current()){render();deliverActions();}});
window.addEventListener('pagehide',end);
window.addEventListener('pageshow',event=>{if(event.persisted&&!account.locked&&account.user?.id===owner){ended=false;void refresh();}});
void refresh();
})();

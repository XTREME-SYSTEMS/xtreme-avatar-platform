/* Account data stays in memory until saved to the signed-in user's private server records. */
(()=>{
'use strict';
// Read the effective document policy, including restrictions inherited from a preview frame.
// A granted browser permission cannot override an ancestor's microphone policy.
window.XtremeMediaContext={read(){
 let framed=false,microphone=null,camera=null;
 try{framed=window.self!==window.top;}catch{framed=true;}
 try{const policy=document.permissionsPolicy||document.featurePolicy;if(typeof policy?.allowsFeature==='function'){
  const mic=policy.allowsFeature('microphone');if(typeof mic==='boolean')microphone=mic;
  const cam=policy.allowsFeature('camera');if(typeof cam==='boolean')camera=cam;
 }}catch{}
 return {framed,microphone,camera,publishedUrl:location.origin+'/'};
}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null,data={},versions={},locked=false,checking=false,signingOut=false,epoch=0;
const requests=new Set();
const queues=new Map(),blocked=new Set();
let videoState='idle',videoScript=null,videoTimer=null;
function videoStateChanged(state){videoState=state;window.dispatchEvent(new Event('xtreme:video-module'));}
function loadVideoModule(){
 if(locked||signingOut||!user||!['idle','error'].includes(videoState))return false;
 const started=epoch,owner=user.id,script=document.createElement('script');videoScript=script;
 const current=()=>!locked&&epoch===started&&user?.id===owner&&videoScript===script&&['loading','slow'].includes(videoState);
 script.src='/tavus-layer.js?accounts=10';
 script.onload=()=>{if(!current())return;clearTimeout(videoTimer);videoStateChanged('ready');};
 script.onerror=()=>{if(!current())return;clearTimeout(videoTimer);script.remove();videoScript=null;videoStateChanged('error');};
 videoStateChanged('loading');
 // A slow script may still execute. Retry only after onerror, never alongside it.
 videoTimer=setTimeout(()=>{if(current())videoStateChanged('slow');},12000);
 document.body.append(script);return true;
}
window.XtremeVideoModule={get state(){return videoState},retry:loadVideoModule};
window.addEventListener('xtreme:account-ended',()=>{clearTimeout(videoTimer);if(videoScript){videoScript.onload=null;videoScript.onerror=null;videoScript.remove();videoScript=null;}videoState='stopped';});
function gate(message,signIn=false){locked=true;epoch++;for(const c of requests)c.abort();requests.clear();window.dispatchEvent(new Event('xtreme:account-ended'));data={};versions={};user=null;queues.clear();blocked.clear();document.querySelector('#sheet-content')?.replaceChildren();document.querySelector('#account-sheet')?.remove();document.querySelector('#main').innerHTML=`<div class="page-title"><p class="eyebrow">YOUR ACCOUNT</p><h1>${signIn?'Sign in to Xtreme Avatar':'Account access'}</h1><p>${esc(message)}</p></div><div class="surface"><a class="gold-button wide" target="_top" href="${signIn?'/signin-with-chatgpt?return_to=%2F':'/signout-with-chatgpt?return_to=%2F'}">${signIn?'Continue with Google':'Sign out / switch account'}</a><button class="silver-button wide" style="margin-top:12px" data-account="reload">Try again</button></div>`;document.querySelector('#bottom-nav').innerHTML='';document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
async function request(path,body){
 const started=epoch,controller=new AbortController();requests.add(controller);const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json','X-Xtreme-Account':user.id}:{},body:body?JSON.stringify(body):undefined});
  const result=await response.json();
  if(started!==epoch||locked)throw new Error('This account session ended.');
  if(!response.ok){if(result.code==='account_changed'||([401,403].includes(response.status)&&path!=='/api/team'))gate(result.error,response.status===401);throw new Error(result.error||'Account request failed.');}
  return result;
 }catch(error){if(error.name==='AbortError')throw new Error('The account request timed out. Try again after checking your connection.');throw error;}
 finally{clearTimeout(timer);requests.delete(controller);}
}
async function save(key,value){
 if(locked||signingOut||blocked.has(key))return false;
 // A failed avatar preference must not replace the last saved selection.
 if(!['model','assistant_preferences'].includes(key))data[key]=structuredClone(value);
 const previous=queues.get(key)||Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
  if(locked||blocked.has(key))return false;
  try{const result=await request('/api/account/state',{key,value,version:versions[key]||0});versions[key]=result.version;if(['model','assistant_preferences'].includes(key))data[key]=structuredClone(value);return true;}
  catch(error){if(locked)return false;blocked.add(key);window.dispatchEvent(new CustomEvent('xtreme:save-error',{detail:error.message}));return false;}
 });queues.set(key,task);task.finally(()=>{if(queues.get(key)===task)queues.delete(key)});return task;
}
async function verify(){if(!user||locked||checking)return;checking=true;try{const current=await request('/api/account');if(current.user.id!==user.id){gate('Your signed-in account changed. Reload to open the correct workspace.');}}catch(error){gate(error.message);}finally{checking=false;}}
function panel(){return `<section class="surface"><h2>Your account</h2><p class="helper">${esc(user.email)} · ${esc(user.role)}</p><p class="helper">Your drafts and preferences are private to your account.</p>${['owner','admin'].includes(user.role)?'<button class="silver-button wide" style="margin-top:14px" data-account="team">Manage members</button>':''}<button class="dark-button wide" style="margin-top:12px" data-account="signout">Sign out</button></section>`;}
function dialog(html){if(locked)return null;let d=document.querySelector('#account-sheet');if(!d){d=document.createElement('dialog');d.id='account-sheet';document.body.append(d);}d.innerHTML='<form method="dialog"><button class="close" aria-label="Close account dialog">×</button></form>'+html;d.showModal();return d;}
async function team(){
 try{const result=await request('/api/team');if(locked)return;const d=dialog(`<h2>Team access</h2><p>Manage app membership. Private drafts are never shown here.</p><form id="member-form"><label class="field">Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label><label class="field">Role<select name="role"><option value="member">Member</option>${user.role==='owner'?'<option value="admin">Administrator</option>':''}</select></label><button class="gold-button wide" type="submit">Approve member</button></form><p class="helper">Approve an email, then share the app link yourself. Each person signs in with their own Google account. This form does not send email.</p><p id="team-status" role="status" class="helper"></p><div>${result.members.map(m=>`<div class="settings-row"><span><strong>${esc(m.email)}</strong><small>${esc(m.role)} · ${esc(m.status)}</small></span>${m.id!==user.id&&m.role!=='owner'&&(user.role==='owner'||m.role==='member')?`<button data-member="${esc(m.id)}" data-role="${esc(m.role)}" data-status="${m.status==='active'?'suspended':'active'}">${m.status==='active'?'Pause':'Restore'}</button>`:''}</div>`).join('')}${result.invitations.map(i=>`<div class="settings-row"><span><strong>${esc(i.email)}</strong><small>${esc(i.role)} · ${i.status==='active'?'Awaiting first sign-in':'Revoked'}</small></span>${i.status==='active'&&(user.role==='owner'||i.role==='member')?`<button data-revoke="${esc(i.email)}">Revoke</button>`:''}</div>`).join('')}</div>`);
 d.querySelector('#member-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const fields=new FormData(e.target);const r=await request('/api/team',{action:'invite',email:fields.get('email'),role:fields.get('role')});d.close();await team();document.querySelector('#team-status').textContent=r.message;}catch(error){if(d.querySelector('#team-status'))d.querySelector('#team-status').textContent=error.message;}finally{button.disabled=false;}};
 d.querySelectorAll('[data-member],[data-revoke]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await request('/api/team',button.dataset.revoke?{action:'revoke_invite',email:button.dataset.revoke}:{action:'update',id:button.dataset.member,role:button.dataset.role,status:button.dataset.status});d.close();await team();}catch(error){if(d.querySelector('#team-status'))d.querySelector('#team-status').textContent=error.message;button.disabled=false;}});
 }catch(error){if(!locked)dialog(`<h2>Team access</h2><p>${esc(error.message)}</p>`);}
}
document.addEventListener('click',async e=>{
 const action=e.target.closest('[data-account]')?.dataset.account;if(!action)return;e.preventDefault();
 if(action==='reload')location.reload();
 if(action==='team')await team();
 if(action==='signout'){
  if(signingOut)return;
  signingOut=true;const priorInert=document.body.inert;document.body.inert=true;
  try{
   let deadline;const results=await Promise.race([Promise.all([...queues.values()]),new Promise(resolve=>{deadline=setTimeout(()=>resolve([false]),8000)})]);clearTimeout(deadline);
   if((results.some(v=>!v)||blocked.size||window.XtremeWork?.hasUnsaved()||window.XtremeWorkHub?.hasUnsaved()||window.XtremeJobCalendar?.hasUnsaved())&&!confirm('Some changes are not saved. Sign out and discard those unsaved changes?'))return;
   const response=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok){throw new Error('Sign out could not finish. Please try again.');}gate('Signing out…');location.assign('/');
  }catch(error){alert(error.message||'Sign out could not finish. Please try again.');}finally{document.body.inert=priorInert;signingOut=false;}

 }
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')verify();});
window.addEventListener('pageshow',e=>{if(e.persisted)verify();});
window.addEventListener('beforeunload',e=>{if(!locked&&(queues.size||blocked.size)){e.preventDefault();e.returnValue='';}});
window.addEventListener('xtreme:save-error',e=>{const el=document.querySelector('#toast');el.textContent=e.detail+' Your change is not saved. Reload before continuing.';el.classList.add('show');});
window.XtremeAccount={read:(key,fallback)=>structuredClone(data[key]??fallback),save,panel,invalidate:(message,signIn=false)=>gate(message,signIn),get user(){return user},get locked(){return locked}};
async function boot(){
 try{const result=await request('/api/account');user=result.user;data=result.data;versions=result.versions;
  // Never import legacy xa.* browser data into an authenticated account.
  const started=epoch,owner=user.id;let appLoaded=false;
  const app=document.createElement('script');app.src='/app.js?accounts=20';app.onerror=()=>{if(!locked&&epoch===started)gate('The app could not load. Please try again.');};app.onload=()=>{if(locked||epoch!==started||user?.id!==owner||appLoaded)return;appLoaded=true;const actionsStyle=document.createElement('link');actionsStyle.rel='stylesheet';actionsStyle.href='/assistant-actions.css?v=1';document.body.append(actionsStyle);const actionsScript=document.createElement('script');actionsScript.src='/assistant-actions.js?v=1';actionsScript.onerror=()=>{window.XtremeAssistantActionsFailed=true;window.dispatchEvent(new Event('xtreme:assistant-actions-ready'));};document.body.append(actionsScript);const jobCalendarStyle=document.createElement('link');jobCalendarStyle.rel='stylesheet';jobCalendarStyle.href='/job-calendar.css?v=1';document.body.append(jobCalendarStyle);const jobCalendar=document.createElement('script');jobCalendar.src='/job-calendar.js?v=1';jobCalendar.onerror=()=>{window.XtremeJobCalendarFailed=true;window.dispatchEvent(new Event('xtreme:job-calendar-ready'));};document.body.append(jobCalendar);const dictationStyle=document.createElement('link');dictationStyle.rel='stylesheet';dictationStyle.href='/voice-fields.css?v=1';document.body.append(dictationStyle);const dictation=document.createElement('script');dictation.type='module';dictation.src='/voice-fields.js?v=1';document.body.append(dictation);const assistantSettingsStyle=document.createElement('link');assistantSettingsStyle.rel='stylesheet';assistantSettingsStyle.href='/assistant-settings.css?v=1';document.body.append(assistantSettingsStyle);const assistantSettings=document.createElement('script');assistantSettings.type='module';assistantSettings.src='/assistant-settings.js?v=1';assistantSettings.onerror=()=>{window.XtremeAssistantSettingsFailed=true;window.dispatchEvent(new Event('xtreme:assistant-settings-ready'));};document.body.append(assistantSettings);const ownerControlsStyle=document.createElement('link');ownerControlsStyle.rel='stylesheet';ownerControlsStyle.href='/owner-controls.css?v=1';document.body.append(ownerControlsStyle);const ownerControls=document.createElement('script');ownerControls.src='/owner-controls.js?v=1';ownerControls.onerror=()=>{window.XtremeOwnerControlsFailed=true;window.dispatchEvent(new Event('xtreme:owner-controls-ready'));};document.body.append(ownerControls);const googleStyle=document.createElement('link');googleStyle.rel='stylesheet';googleStyle.href='/google-workspace.css?v=2';document.body.append(googleStyle);const google=document.createElement('script');google.src='/google-workspace.js?v=3';google.onerror=()=>{window.XtremeGoogleWorkspaceFailed=true;window.dispatchEvent(new Event('xtreme:google-workspace-ready'));};document.body.append(google);const bid=document.createElement('script');bid.src='/bid-tools.js?v=1';bid.onerror=()=>{window.XtremeBidFailed=true;window.dispatchEvent(new Event('xtreme:bid-ready'));};document.body.append(bid);const decisions=document.createElement('script');decisions.src='/decision-tools.js?v=1';decisions.onerror=()=>{window.XtremeDecisionsFailed=true;window.dispatchEvent(new Event('xtreme:decisions-ready'));};document.body.append(decisions);const workspace=document.createElement('script');workspace.src='/workspace.js?v=3';workspace.onerror=()=>{window.XtremeWorkFailed=true;window.dispatchEvent(new Event('xtreme:work-ready'));};document.body.append(workspace);const hubStyle=document.createElement('link');hubStyle.rel='stylesheet';hubStyle.href='/work-hub.css?v=1';document.body.append(hubStyle);const hub=document.createElement('script');hub.src='/work-hub.js?v=1';hub.onerror=()=>{window.XtremeWorkHubFailed=true;window.dispatchEvent(new Event('xtreme:work-hub-ready'));};document.body.append(hub);const calling=document.createElement('script');calling.src='/calling.js?v=4';calling.onerror=()=>{window.XtremeCallingFailed=true;const node=document.querySelector('#call-error');if(node)node.textContent='The call desk could not load. Reload to try again.';};document.body.append(calling);const chatStyle=document.createElement('link');chatStyle.rel='stylesheet';chatStyle.href='/assistant-chat.css?v=1';document.body.append(chatStyle);const chat=document.createElement('script');chat.src='/assistant-chat.js?v=2';chat.onerror=()=>{if(!locked)window.dispatchEvent(new Event('xtreme:assistant-chat-failed'));};document.body.append(chat);const voiceStyle=document.createElement('link');voiceStyle.rel='stylesheet';voiceStyle.href='/assistant-voice.css?v=2';document.body.append(voiceStyle);const voice=document.createElement('script');voice.src='/assistant-voice.js?v=4';voice.onerror=()=>{if(!locked)window.dispatchEvent(new Event('xtreme:assistant-voice-failed'));};document.body.append(voice);loadVideoModule();};document.body.append(app);
 }catch(error){gate(error.message,/sign in/i.test(error.message));}
}
boot();
})();
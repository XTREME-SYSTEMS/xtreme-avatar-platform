(() => {
'use strict';
const account=window.XtremeAccount;
const owner=account?.user?.id;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';

const PERMISSION_GROUPS=[
 {id:'gmail',name:'Gmail',copy:'Email, drafts, inbox organization and sending.',items:[
  ['google.gmail.read','Read email'],['google.gmail.organize','Label, archive & read state'],['google.gmail.send','Send email'],['google.gmail.delete','Trash & restore email']]},
 {id:'calendar',name:'Calendar',copy:'Appointments and scheduling.',items:[
  ['google.calendar.read','Read calendars'],['google.calendar.create','Create events'],['google.calendar.update','Edit events']]},
 {id:'drive',name:'Drive',copy:'Files, folders and sharing.',items:[
  ['google.drive.read','Read files'],['google.drive.create','Create folders/files'],['google.drive.edit','Rename & edit metadata'],['google.drive.move','Move files'],['google.drive.share','Share files'],['google.drive.delete','Trash & restore files']]},
 {id:'docs',name:'Docs',copy:'Google documents.',items:[
  ['google.docs.read','Read documents'],['google.docs.create','Create documents'],['google.docs.edit','Edit documents']]},
 {id:'sheets',name:'Sheets',copy:'Spreadsheet work.',items:[
  ['google.sheets.read','Read spreadsheets'],['google.sheets.create','Create spreadsheets'],['google.sheets.edit','Update & append data']]},
 {id:'slides',name:'Slides',copy:'Presentation work.',items:[
  ['google.slides.read','Read presentations'],['google.slides.create','Create presentations'],['google.slides.edit','Edit presentations']]},
 {id:'contacts',name:'Contacts',copy:'People and address book.',items:[
  ['google.contacts.read','Read contacts'],['google.contacts.create','Create contacts'],['google.contacts.edit','Edit contacts'],['google.contacts.delete','Delete contacts']]},
 {id:'tasks',name:'Tasks',copy:'Lists, tasks and completion.',items:[
  ['google.tasks.read','Read tasks'],['google.tasks.create','Create tasks'],['google.tasks.edit','Edit tasks'],['google.tasks.complete','Complete tasks'],['google.tasks.delete','Delete tasks']]},
 {id:'communications',name:'Communications',copy:'Voice, video, phone and messaging.',items:[
  ['communications.voice','AI voice'],['communications.video','AI video'],['communications.calls.inbound','Handle inbound calls'],['communications.calls.outbound','Place outbound calls'],['communications.calls.three_way','Three-way calls'],['communications.sms.read','Read SMS'],['communications.sms.send','Send SMS'],['communications.mms.send','Send MMS'],['communications.whatsapp.send','Send WhatsApp']]},
 {id:'browser',name:'Browser & Scraper',copy:'Web research and browser work.',items:[
  ['browser.read','Read web pages'],['browser.interact','Click, type & navigate'],['browser.scrape','Scrape approved sources'],['browser.download','Download files'],['browser.upload','Upload files']]},
 {id:'social',name:'Auto Social',copy:'Social media creation and publishing.',items:[
  ['social.read','Read connected social data'],['social.create','Create posts/assets'],['social.publish','Publish posts'],['social.delete','Delete posts']]},
 {id:'visual',name:'Visual Editor',copy:'Design and visual production.',items:[
  ['visual.read','Read designs'],['visual.edit','Edit designs'],['visual.export','Export assets']]},
 {id:'infinity',name:'X1 Infinity Loop',copy:'Business orchestration and execution.',items:[
  ['infinity.read','Read loop state'],['infinity.write','Write work/state'],['infinity.run','Run approved workflows'],['infinity.approve','Approve releases']]},
 {id:'developer',name:'Developer & Deployment',copy:'GitHub, Vercel, Supabase and Railway.',items:[
  ['developer.github.read','Read GitHub'],['developer.github.write','Write GitHub'],['developer.vercel.read','Read Vercel'],['developer.vercel.deploy','Deploy Vercel'],['developer.supabase.read','Read Supabase'],['developer.supabase.write','Write Supabase'],['developer.railway.read','Read Railway'],['developer.railway.write','Write Railway']]},
 {id:'memory',name:'Memory & Knowledge',copy:'Private memory and company intelligence.',items:[
  ['memory.private.read','Read private memory'],['memory.private.write','Write private memory'],['knowledge.company.read','Read company knowledge'],['knowledge.company.write','Write company knowledge']]}
];

const APPROVALS=[
 ['send_email','Send email'],['send_message','Send SMS/MMS/WhatsApp'],['outbound_call','Place outbound calls'],
 ['three_way_call','Start three-way calls'],['calendar_external_invites','Invite people to Calendar events'],
 ['publish_social','Publish social content'],['share_file','Share files outside your account'],['delete_data','Delete or trash data'],
 ['production_deploy','Deploy to production'],['permission_change','Change permissions or access'],
 ['external_submission','Submit forms/applications externally'],['purchase_or_spend','Purchase or spend money'],
 ['batch_external_actions','Run batches of external actions'],['infinity_release','Approve Infinity Loop release actions']
];

const MODULES=[
 ['google','Google Workspace','Gmail, Calendar, Drive, Docs, Sheets, Slides, Contacts & Tasks'],
 ['communications','Communications','Voice, video, calls, SMS, MMS & WhatsApp'],
 ['vercel','Vercel','Web delivery and deployment surface'],
 ['autoSocial','Auto Social','Connect your Auto Social system next'],
 ['visualEditor','Visual Editor Canvas','Connect design/editor controls next'],
 ['scraperBrowser','Scraper Browser','Connect browser/scraping controls next'],
 ['infinityLoop','X1 Infinity Loop','Connect orchestration and work execution next'],
 ['developerTools','Developer Tools','GitHub, Supabase, Railway and advanced deployment controls']
];

const DEFAULT={
 version:1,mode:'full_partner',
 permissions:PERMISSION_GROUPS.flatMap(g=>g.items.map(i=>i[0])),
 approvals:APPROVALS.map(i=>i[0]),
 automation:{proactive:true,continueReversible:true,batch:true,parallelLimit:6,background:false,scheduled:false},
 privacy:{memory:true,companyKnowledge:true,crossDevice:true,conversationHistory:true,location:false},
 notifications:{inApp:true,push:true,email:false,sms:false,quietHours:{enabled:false,start:'21:00',end:'07:00'}},
 modules:{google:true,communications:true,vercel:true,autoSocial:false,visualEditor:false,scraperBrowser:false,infinityLoop:false,developerTools:false},
 advanced:{receipts:true,diagnostics:true,showRawFailures:false,allowExperimental:false}
};

const PRESETS={
 full_partner:()=>structuredClone(DEFAULT),
 balanced:()=>{
  const v=structuredClone(DEFAULT);v.mode='balanced';v.automation.proactive=true;v.automation.continueReversible=true;v.automation.batch=false;v.automation.parallelLimit=4;v.automation.background=false;v.automation.scheduled=false;
  v.permissions=v.permissions.filter(id=>!['google.gmail.delete','google.drive.share','google.drive.delete','google.contacts.delete','google.tasks.delete','social.publish','social.delete','developer.vercel.deploy','developer.supabase.write','developer.railway.write','infinity.approve'].includes(id));return v;
 },
 ask_first:()=>{
  const v=structuredClone(DEFAULT);v.mode='ask_first';v.automation.proactive=false;v.automation.continueReversible=false;v.automation.batch=false;v.automation.parallelLimit=1;v.automation.background=false;v.automation.scheduled=false;
  v.permissions=v.permissions.filter(id=>id.endsWith('.read')||id==='communications.voice'||id==='communications.video'||id==='memory.private.read'||id==='knowledge.company.read');return v;
 }
};

let ended=false,generation=0,pending=false,notice='',tab='behavior';
const saved=account?.read('assistant_controls',DEFAULT);
let controls=normalize(saved);

function normalize(v){
 try{
  const x=structuredClone(v);
  if(!x||x.version!==1)return structuredClone(DEFAULT);
  x.permissions=Array.isArray(x.permissions)?[...new Set(x.permissions)]:[...DEFAULT.permissions];
  x.approvals=Array.isArray(x.approvals)?[...new Set(x.approvals)]:[...DEFAULT.approvals];
  x.automation={...DEFAULT.automation,...x.automation};
  x.privacy={...DEFAULT.privacy,...x.privacy};
  x.notifications={...DEFAULT.notifications,...x.notifications,quietHours:{...DEFAULT.notifications.quietHours,...x.notifications?.quietHours}};
  x.modules={...DEFAULT.modules,...x.modules};
  x.advanced={...DEFAULT.advanced,...x.advanced};
  if(!['full_partner','balanced','ask_first'].includes(x.mode))x.mode='full_partner';
  return x;
 }catch{return structuredClone(DEFAULT);}
}
function active(){return !ended&&owner&&!account.locked&&account.user?.id===owner&&location.hash==='#settings';}
function changed(){if(active())window.dispatchEvent(new Event('xtreme:owner-controls-changed'));}
function hasPermission(id){return controls.permissions.includes(id);}
function hasApproval(id){return controls.approvals.includes(id);}
function toggle(array,id,on){return on?[...new Set([...array,id])]:array.filter(v=>v!==id);}
function switchRow(key,label,copy,on,attrs=''){return `<label class="oc-switch-row"><span><strong>${esc(label)}</strong><small>${esc(copy)}</small></span><input type="checkbox" ${attrs} data-oc-toggle="${esc(key)}"${on?' checked':''}${pending?' disabled':''}><span class="oc-switch" aria-hidden="true"></span></label>`;}
function presetCards(){return `<div class="oc-presets">${[
  ['full_partner','Full Partner','Maximum useful access. High-impact actions can still require approval.'],
  ['balanced','Balanced','Read/create/edit widely, with destructive and publishing powers reduced.'],
  ['ask_first','Ask First','Mostly read-only. The assistant asks before taking meaningful action.']
 ].map(([id,name,copy])=>`<button type="button" class="oc-preset${controls.mode===id?' is-selected':''}" data-oc-preset="${id}"${pending?' disabled':''}><strong>${name}</strong><small>${copy}</small><span>${controls.mode===id?'Active':'Use preset'}</span></button>`).join('')}</div>`;}

function behaviorPanel(){const a=controls.automation;return `
 <div class="oc-section-head"><h3>How your assistant operates</h3><p>Set initiative, batch behavior and how much work can move at once.</p></div>
 ${presetCards()}
 <section class="oc-card"><h4>Initiative</h4>
 ${switchRow('automation.proactive','Proactive partner','Suggest next steps and surface useful work before you ask.',a.proactive)}
 ${switchRow('automation.continueReversible','Continue through reversible work','Keep going through safe steps instead of stopping after every small action.',a.continueReversible)}
 ${switchRow('automation.batch','Batch actions','Allow grouped work when the connected system supports it.',a.batch)}
 ${switchRow('automation.background','Background continuation','Allow connected runtimes to continue approved work outside the foreground session.',a.background)}
 ${switchRow('automation.scheduled','Scheduled work','Allow recurring or scheduled workflows when a scheduler is connected.',a.scheduled)}
 <label class="oc-range"><span><strong>Parallel work limit</strong><small>How many bounded workstreams the assistant may coordinate.</small></span><output>${a.parallelLimit}</output><input type="range" min="1" max="20" value="${a.parallelLimit}" data-oc-range="automation.parallelLimit"${pending?' disabled':''}></label>
 </section>`;}

function permissionsPanel(){return `<div class="oc-section-head"><h3>Exactly what it may do</h3><p>Turn individual abilities on or off. Connection permissions and these controls must both allow an action.</p></div>
 <div class="oc-permission-groups">${PERMISSION_GROUPS.map(group=>`<details class="oc-permission-group" ${['gmail','calendar','drive'].includes(group.id)?'open':''}><summary><span><strong>${group.name}</strong><small>${group.copy}</small></span><span>${group.items.filter(i=>hasPermission(i[0])).length}/${group.items.length}</span></summary><div>${group.items.map(([id,label])=>switchRow(id,label,'',hasPermission(id),'data-oc-permission="'+esc(id)+'"')).join('')}</div></details>`).join('')}</div>`;}

function approvalsPanel(){return `<div class="oc-section-head"><h3>Approval gates</h3><p>When a gate is ON, direct AI execution of that high-impact action is held until an approved review path is available. Turn the gate off only when you want the assistant to execute that action directly.</p></div><section class="oc-card oc-approval-list">${APPROVALS.map(([id,label])=>switchRow(id,label,'Require confirmation before this action.',hasApproval(id),'data-oc-approval="'+esc(id)+'"')).join('')}</section><p class="oc-note">Account security, credentials, billing, and provider-required consent may still require separate confirmation even if a gate is off.</p>`;}

function privacyPanel(){const p=controls.privacy;return `<div class="oc-section-head"><h3>Memory & privacy</h3><p>Choose what context can follow the user and what stays out.</p></div><section class="oc-card">
 ${switchRow('privacy.memory','Private memory','Allow the assistant to remember useful private context.',p.memory)}
 ${switchRow('privacy.companyKnowledge','Company knowledge','Use connected company knowledge when permitted.',p.companyKnowledge)}
 ${switchRow('privacy.crossDevice','Cross-device continuity','Carry authorized settings and context across devices.',p.crossDevice)}
 ${switchRow('privacy.conversationHistory','Conversation continuity','Use prior conversation context when available.',p.conversationHistory)}
 ${switchRow('privacy.location','Location context','Allow location-aware help when the device and product expose it.',p.location)}
 </section>`;}

function systemsPanel(){return `<div class="oc-section-head"><h3>Systems & integrations</h3><p>Choose which connected systems the assistant is allowed to use. A toggle does not create a connection by itself.</p></div><div class="oc-module-grid">${MODULES.map(([id,name,copy])=>`<article class="oc-module"><div><strong>${name}</strong><small>${copy}</small></div><label><input type="checkbox" data-oc-module="${id}"${controls.modules[id]?' checked':''}${pending?' disabled':''}><span class="oc-switch" aria-hidden="true"></span></label>${['autoSocial','visualEditor','scraperBrowser','infinityLoop'].includes(id)?'<span class="oc-module-badge">Connector next</span>':''}${id==='vercel'?'<span class="oc-module-badge is-live">Delivery surface</span>':''}</article>`).join('')}</div><button type="button" class="oc-link" data-route="connections">Manage connected accounts ${arrow}</button>`;}

function notificationsPanel(){const n=controls.notifications;return `<div class="oc-section-head"><h3>Notifications & quiet hours</h3><p>Control how the assistant gets your attention.</p></div><section class="oc-card">
 ${switchRow('notifications.inApp','In-app updates','Show operational updates inside Xtreme Avatar.',n.inApp)}
 ${switchRow('notifications.push','Push notifications','Use push alerts when the installed app supports them.',n.push)}
 ${switchRow('notifications.email','Email notifications','Allow operational notifications by email when connected.',n.email)}
 ${switchRow('notifications.sms','SMS notifications','Allow operational notifications by SMS when connected.',n.sms)}
 ${switchRow('notifications.quietHours.enabled','Quiet hours','Suppress non-urgent notifications during the selected window.',n.quietHours.enabled)}
 <div class="oc-time-grid"><label>Start<input type="time" data-oc-time="notifications.quietHours.start" value="${esc(n.quietHours.start)}"${pending?' disabled':''}></label><label>End<input type="time" data-oc-time="notifications.quietHours.end" value="${esc(n.quietHours.end)}"${pending?' disabled':''}></label></div>
 </section>`;}

function advancedPanel(){const a=controls.advanced;return `<div class="oc-section-head"><h3>Advanced controls</h3><p>Receipts, diagnostics and experimental capability flags.</p></div><section class="oc-card">
 ${switchRow('advanced.receipts','Action receipts','Keep visible receipts for important actions and changes.',a.receipts)}
 ${switchRow('advanced.diagnostics','Diagnostics','Allow health checks and operational diagnostics.',a.diagnostics)}
 ${switchRow('advanced.showRawFailures','Detailed failures','Show more technical failure detail to advanced users.',a.showRawFailures)}
 ${switchRow('advanced.allowExperimental','Experimental tools','Allow capabilities marked experimental when connected.',a.allowExperimental)}
 </section><button type="button" class="oc-reset" data-oc-reset${pending?' disabled':''}>Restore Full Partner defaults</button>`;}

const PANELS={behavior:behaviorPanel,permissions:permissionsPanel,approvals:approvalsPanel,privacy:privacyPanel,systems:systemsPanel,notifications:notificationsPanel,advanced:advancedPanel};

function render(){
 if(!active()&&location.hash!=='#settings')return '';
 return `<section class="owner-controls" aria-label="Owner control center">
 <div class="oc-hero"><span class="eyebrow">OWNER CONTROL CENTER</span><h2>Your assistant. Your rules.</h2><p>Give the AI broad access where you want it, lock down what you do not, and choose exactly when it must ask first.</p><div class="oc-status"><span class="oc-mode">${esc(controls.mode.replaceAll('_',' '))}</span><span>${controls.permissions.length} permissions enabled</span><span>${controls.approvals.length} approval gates on</span></div></div>
 <div id="owner-controls-status" class="oc-save-status${notice&&notice.startsWith('Not')?' has-error':''}" role="status" aria-live="polite">${esc(pending?'Saving settings…':notice)}</div>
 <div class="oc-tabs" role="tablist" aria-label="Owner settings">${[['behavior','Behavior'],['permissions','Permissions'],['approvals','Approvals'],['privacy','Privacy'],['systems','Systems'],['notifications','Alerts'],['advanced','Advanced']].map(([id,label])=>`<button type="button" role="tab" aria-selected="${tab===id}" data-oc-tab="${id}">${label}</button>`).join('')}</div>
 <div class="oc-panel" role="tabpanel">${PANELS[tab]()}</div>
 </section>`;
}

function rerender(){const node=document.querySelector('.owner-controls');if(node)node.outerHTML=render();}
async function save(next){
 if(!active()||pending)return false;
 const before=controls;controls=normalize(next);pending=true;notice='';rerender();
 const revision=++generation;let ok=false;
 try{ok=await account.save('assistant_controls',structuredClone(controls));}catch{}
 if(!active()||revision!==generation)return false;
 pending=false;
 if(ok){notice='Saved. New permissions apply to the next assistant action.';}
 else{controls=before;notice='Not saved. Reload before changing more settings.';}
 rerender();changed();return ok;
}
function setPath(path,value){
 const next=structuredClone(controls),parts=path.split('.');let node=next;
 for(let i=0;i<parts.length-1;i++)node=node[parts[i]];
 node[parts.at(-1)]=value;return next;
}
document.addEventListener('click',event=>{
 if(!active())return;
 const tabButton=event.target.closest?.('[data-oc-tab]');if(tabButton){event.preventDefault();if(PANELS[tabButton.dataset.ocTab]){tab=tabButton.dataset.ocTab;rerender();}return;}
 const preset=event.target.closest?.('[data-oc-preset]');if(preset){event.preventDefault();const fn=PRESETS[preset.dataset.ocPreset];if(fn)void save(fn());return;}
 if(event.target.closest?.('[data-oc-reset]')){event.preventDefault();void save(PRESETS.full_partner());}
});
document.addEventListener('change',event=>{
 if(!active()||pending)return;
 const p=event.target.dataset.ocPermission;if(p){void save({...controls,permissions:toggle(controls.permissions,p,event.target.checked)});return;}
 const a=event.target.dataset.ocApproval;if(a){void save({...controls,approvals:toggle(controls.approvals,a,event.target.checked)});return;}
 const m=event.target.dataset.ocModule;if(m){void save({...controls,modules:{...controls.modules,[m]:event.target.checked}});return;}
 const t=event.target.dataset.ocToggle;if(t){void save(setPath(t,event.target.checked));return;}
 const time=event.target.dataset.ocTime;if(time&&/^\d{2}:\d{2}$/.test(event.target.value)){void save(setPath(time,event.target.value));}
});
document.addEventListener('input',event=>{
 if(!active()||pending)return;
 if(event.target.dataset.ocRange==='automation.parallelLimit'){
  const value=Math.max(1,Math.min(20,Number(event.target.value)||1));
  const output=event.target.closest('.oc-range')?.querySelector('output');if(output)output.value=String(value);
 }
});
document.addEventListener('change',event=>{
 if(!active()||pending||event.target.dataset.ocRange!=='automation.parallelLimit')return;
 const value=Math.max(1,Math.min(20,Number(event.target.value)||1));void save(setPath('automation.parallelLimit',value));
});
window.addEventListener('xtreme:account-ended',()=>{ended=true;generation++;pending=false;notice='';controls=structuredClone(DEFAULT);document.querySelector('.owner-controls')?.replaceChildren();});
window.XtremeOwnerControls={render,get controls(){return structuredClone(controls)}};
window.dispatchEvent(new Event('xtreme:owner-controls-ready'));
})();
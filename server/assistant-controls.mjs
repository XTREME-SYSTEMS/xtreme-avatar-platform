const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const bool=value=>typeof value==='boolean';
const hhmm=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export const ASSISTANT_PERMISSION_IDS=Object.freeze([
 'google.gmail.read','google.gmail.organize','google.gmail.send','google.gmail.delete',
 'google.calendar.read','google.calendar.create','google.calendar.update',
 'google.drive.read','google.drive.create','google.drive.edit','google.drive.move','google.drive.share','google.drive.delete',
 'google.docs.read','google.docs.create','google.docs.edit',
 'google.sheets.read','google.sheets.create','google.sheets.edit',
 'google.slides.read','google.slides.create','google.slides.edit',
 'google.contacts.read','google.contacts.create','google.contacts.edit','google.contacts.delete',
 'google.tasks.read','google.tasks.create','google.tasks.edit','google.tasks.complete','google.tasks.delete',
 'communications.voice','communications.video','communications.calls.inbound','communications.calls.outbound','communications.calls.three_way',
 'communications.sms.read','communications.sms.send','communications.mms.send','communications.whatsapp.send',
 'browser.read','browser.interact','browser.scrape','browser.download','browser.upload',
 'social.read','social.create','social.publish','social.delete',
 'visual.read','visual.edit','visual.export',
 'infinity.read','infinity.write','infinity.run','infinity.approve',
 'developer.github.read','developer.github.write','developer.vercel.read','developer.vercel.deploy',
 'developer.supabase.read','developer.supabase.write','developer.railway.read','developer.railway.write',
 'memory.private.read','memory.private.write','knowledge.company.read','knowledge.company.write'
]);

export const ASSISTANT_APPROVAL_IDS=Object.freeze([
 'send_email','send_message','outbound_call','three_way_call','calendar_external_invites',
 'publish_social','share_file','delete_data','production_deploy','permission_change',
 'external_submission','purchase_or_spend','batch_external_actions','infinity_release'
]);

const PERMISSIONS=new Set(ASSISTANT_PERMISSION_IDS);
const APPROVALS=new Set(ASSISTANT_APPROVAL_IDS);
const MODES=new Set(['full_partner','balanced','ask_first']);

export const DEFAULT_ASSISTANT_CONTROLS=Object.freeze({
 version:1,
 mode:'full_partner',
 permissions:[...ASSISTANT_PERMISSION_IDS],
 approvals:[...ASSISTANT_APPROVAL_IDS],
 automation:{
  proactive:true,
  continueReversible:true,
  batch:true,
  parallelLimit:6,
  background:false,
  scheduled:false
 },
 privacy:{
  memory:true,
  companyKnowledge:true,
  crossDevice:true,
  conversationHistory:true,
  location:false
 },
 notifications:{
  inApp:true,
  push:true,
  email:false,
  sms:false,
  quietHours:{enabled:false,start:'21:00',end:'07:00'}
 },
 modules:{
  google:true,
  communications:true,
  vercel:true,
  autoSocial:false,
  visualEditor:false,
  scraperBrowser:false,
  infinityLoop:false,
  developerTools:false
 },
 advanced:{
  receipts:true,
  diagnostics:true,
  showRawFailures:false,
  allowExperimental:false
 }
});

function validIdList(value,allowed){
 return Array.isArray(value)&&value.length<=allowed.size&&
  value.every(id=>typeof id==='string'&&allowed.has(id))&&new Set(value).size===value.length;
}

export function validAssistantControls(value){
 if(!exact(value,['version','mode','permissions','approvals','automation','privacy','notifications','modules','advanced']))return false;
 if(value.version!==1||!MODES.has(value.mode)||!validIdList(value.permissions,PERMISSIONS)||!validIdList(value.approvals,APPROVALS))return false;

 const a=value.automation;
 if(!exact(a,['proactive','continueReversible','batch','parallelLimit','background','scheduled'])||
  !bool(a.proactive)||!bool(a.continueReversible)||!bool(a.batch)||!Number.isInteger(a.parallelLimit)||a.parallelLimit<1||a.parallelLimit>20||!bool(a.background)||!bool(a.scheduled))return false;

 const p=value.privacy;
 if(!exact(p,['memory','companyKnowledge','crossDevice','conversationHistory','location'])||
  !Object.values(p).every(bool))return false;

 const n=value.notifications;
 if(!exact(n,['inApp','push','email','sms','quietHours'])||!bool(n.inApp)||!bool(n.push)||!bool(n.email)||!bool(n.sms)||
  !exact(n.quietHours,['enabled','start','end'])||!bool(n.quietHours.enabled)||!hhmm(n.quietHours.start)||!hhmm(n.quietHours.end))return false;

 const m=value.modules;
 if(!exact(m,['google','communications','vercel','autoSocial','visualEditor','scraperBrowser','infinityLoop','developerTools'])||
  !Object.values(m).every(bool))return false;

 const d=value.advanced;
 if(!exact(d,['receipts','diagnostics','showRawFailures','allowExperimental'])||!Object.values(d).every(bool))return false;

 return JSON.stringify(value).length<=50000;
}

export function normalizeAssistantControls(value){
 return validAssistantControls(value)?structuredClone(value):structuredClone(DEFAULT_ASSISTANT_CONTROLS);
}

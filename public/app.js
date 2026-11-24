'use strict';
// Shared by both dial pads and the call review form. An explicit + preserves
// the entered country code; only valid North American national numbers default to +1.
window.XtremePhone=Object.freeze({defaultCountryCode:'+1',normalize(value){
 if(typeof value!=='string'||value.length>64||!/^[+0-9 ().-]+$/.test(value))return '';
 const number=value.replace(/[ ().-]/g,'');
 if(number.startsWith('+'))return /^\+[1-9][0-9]{7,14}$/.test(number)?number:'';
 const national=number.length===11&&number.startsWith('1')?number.slice(1):number;
 return /^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(national)?'+1'+national:'';
}});
const paths={home:'<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3z"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',video:'<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 9 6-4v14l-6-4"/>',phone:'<path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2z"/>',chat:'<path d="M21 10a8 8 0 0 1-8 8H8l-5 4 1-7a8 8 0 0 1 7-12h2a8 8 0 0 1 8 7Z"/><circle cx="8" cy="10" r=".8"/><circle cx="12" cy="10" r=".8"/><circle cx="16" cy="10" r=".8"/>',wave:'<path d="M3 10v4M7 5v14M12 2v20M17 6v12M21 9v6"/>',mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',people:'<circle cx="12" cy="7" r="4"/><path d="M5 22v-3a7 7 0 0 1 14 0v3M3 4a3 3 0 0 1 0 6m0 3a5 5 0 0 0-2 4v4M21 4a3 3 0 0 0 0 6m0 3a5 5 0 0 1 2 4v4"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 18 6-6 4 4 4-5 4 5"/>',settings:'<path d="M3 5h18M3 12h18M3 19h18"/><circle cx="8" cy="5" r="3" fill="#343437"/><circle cx="16" cy="12" r="3" fill="#343437"/><circle cx="8" cy="19" r="3" fill="#343437"/>',chevron:'<path d="m9 5 7 7-7 7"/>',plus:'<path d="M12 4v16M4 12h16"/>',back:'<path d="m9 5-7 7 7 7h12V5zm4 4 4 6m0-6-4 6"/>',trash:'<path d="M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',check:'<path d="m4 12 5 5L20 6"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',camera:'<path d="M3 6h4l2-3h6l2 3h4v15H3z"/><circle cx="12" cy="13" r="4"/>',stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',arrow:'<path d="M3 12h18m-6-6 6 6-6 6"/>',external:'<path d="M14 3h7v7m0-7L10 14m1-10H4v16h16v-7"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>'};
Object.assign(paths,{bid:'<path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h5"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',trend:'<path d="M3 3v18h18M6 15l5-5 4 3 6-8m-5 0h5v5"/>',simulate:'<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="3"/><circle cx="16" cy="12" r="3"/><circle cx="10" cy="18" r="3"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-13 4h3m3 0h2"/>',followup:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5M12 7v5l3 2"/>',note:'<path d="M13 4H4v16h16v-9M8 16l1-4L19 2l3 3-10 10-4 1Z"/>',notes:'<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M2 7h6m-6 5h6m-6 5h6m3-10h5m-5 5h5m-5 5h3"/>'});
const icon=(name)=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.grid}</svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=s=>document.querySelector(s);
const account=window.XtremeAccount;
const read=(key,fallback)=>account.read(key,fallback);
let profile=read('profile',{name:''});
let draft=read('draft',{to:'',body:'',channel:'SMS'}),dial='';
const chatOwnerId=account.user?.id,CHAT_MAX=4000;
let chatDraft=read('assistant_chat_draft','');
if(typeof chatDraft!=='string')chatDraft='';
chatDraft=chatDraft.slice(0,CHAT_MAX);
let chatRevision=0,chatSaveState=chatDraft?'saved':'empty',chatNotice='',chatSent=false;
const DICTATION_MAX=6000;
let dictationDraft=read('transcript','');
if(typeof dictationDraft!=='string')dictationDraft='';
dictationDraft=dictationDraft.slice(0,DICTATION_MAX);
let dictationRevision=0;
const chatPrompts={day:['Plan my day','Help me plan my day. My priorities are:'],followup:['Draft a follow-up',"Help me draft a follow-up. Here’s the context:"],bid:['Help with a bid','Help me prepare a bid. Project details:'],notes:['Summarize notes','Summarize these notes and suggest next steps:']};
const nav=[['home','home','Home'],['prepare','grid','Prepare'],['calls','phone','Dial'],['dictate','wave','Dictate'],['messages','chat','Messages'],['video','video','Video']];
const routes=['home','prepare','dictate','voice','calls','messages','sms','video','settings','models','gallery','customize','connections','calendar','workspace','projects','results','briefing','prediction','simulation','bid','leads'];
let draftRevision=0,profileRevision=0;
function toast(message){if(account.locked)return;const node=$('#toast');node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3500)}
function route(){const hash=location.hash.slice(1);return hash==='chat'?'messages':hash==='dial'?'calls':routes.includes(hash)?hash:'home'}
function go(r){if(account.locked)return;if(route()==='calendar'&&r!=='calendar'&&window.XtremeJobCalendar?.confirmLeave&&!window.XtremeJobCalendar.confirmLeave())return;if(route()===r)render();else location.hash=r;window.scrollTo(0,0)}
function heading(kicker,title,copy=''){return `<div class="page-top"><button class="back-button" data-route="home" aria-label="Back to home">‹ <span>Back</span></button><span class="eyebrow">${kicker}</span></div><div class="page-title"><h1>${title}</h1>${copy?`<p>${copy}</p>`:''}</div>`}
function tool(r,ic,title,copy){return `<button class="tool-row" data-route="${r}"><span class="tool-icon">${icon(ic)}</span><span class="tool-copy"><strong>${title}</strong><small>${copy}</small></span>${icon('chevron')}</button>`}
function workspaceBody(){return window.XtremeWork?window.XtremeWork.renderHome():`<section class="assist-loading" role="status"><h2>Your workspace</h2><p>${window.XtremeWorkFailed?'Your workspace could not load. Reload to try again.':'Opening your private workspace…'}</p>${window.XtremeWorkFailed?'<button class="silver-button" data-account="reload">Reload workspace</button>':''}</section>`}
function decisionTool(mode){return heading(mode==='prediction'?'PREDICTION':'SIMULATION',mode==='prediction'?'See what may come next.':'Explore the what-if.')+(window.XtremeDecisions?window.XtremeDecisions.render(mode):`<section class="assist-loading" role="status"><p>${window.XtremeDecisionsFailed?'This tool could not load. Reload to try again.':'Opening your decision tool…'}</p>${window.XtremeDecisionsFailed?'<button class="silver-button" data-account="reload">Reload tools</button>':''}</section>`)}
function prediction(){return decisionTool('prediction')}
function simulation(){return decisionTool('simulation')}
function bid(){return heading('BID GENERATOR','Build your next bid.')+(window.XtremeBid?window.XtremeBid.render():`<section class="assist-loading" role="status"><p>${window.XtremeBidFailed?'The bid tool could not load. Reload to try again.':'Opening your bid generator…'}</p>${window.XtremeBidFailed?'<button class="silver-button" data-account="reload">Reload tools</button>':''}</section>`)}
function leads(){return heading('AUTO LEADS','Find your next project.')+`<section class="surface lead-handoff"><span class="badge">Existing XPS Auto Leads</span><h2>Construction lead discovery</h2><p>Open your existing workspace to review projects, bid opportunities, and source records.</p><a class="dark-button wide" href="https://autoleads.base44.app" target="_blank" rel="noopener noreferrer">${icon('search')} Open Auto Leads ${icon('external')}</a><p class="helper">Opens separately. Sign in with your own authorized account.</p><p class="helper">Direct scraping from this phone app is awaiting connection. No search or outreach starts when you open this page.</p></section><button class="requests-link" data-route="workspace" data-work="template" data-template="leadbrief"><span>${icon('note')}<span><strong>Prepare a lead search</strong><small>Save your trade, area, and project criteria.</small></span></span>${icon('chevron')}</button>`}
function workspace(){return heading('TASKS','What needs doing?')+tool('calendar','calendar','Calendar & jobs','Your appointments, project notes, and files.')+tool('briefing','calendar','Today’s briefing','Your saved priorities and project dates.')+tool('projects','grid','Job folders','Plans, notes, clients, and project links.')+tool('results','check','Results inbox','Your saved drafts and deliverables.')+workspaceBody()}
function workHubPage(mode){const names={projects:['JOB FOLDERS','Keep each job together.'],results:['RESULTS INBOX','Your work, in one place.'],briefing:['TODAY','Start with what matters.']};return heading(...names[mode])+(window.XtremeWorkHub?window.XtremeWorkHub.render(mode):`<section class="assist-loading" role="status"><p>${window.XtremeWorkHubFailed?'Your work hub could not load. Reload to try again.':'Opening your private work hub…'}</p>${window.XtremeWorkHubFailed?'<button class="silver-button" data-account="reload">Reload work hub</button>':''}</section>`)}
function projects(){return workHubPage('projects')}
function results(){return workHubPage('results')}
function briefing(){return workHubPage('briefing')}
function prepare(){return heading('PREPARE','Get ready before the next move.')+tool('calendar','calendar','Calendar & jobs','Appointments, project notes, and files.')+tool('briefing','calendar','Today’s briefing','Priorities, dates, and what needs attention.')+tool('projects','grid','Job folders','Plans, notes, clients, and project links.')+tool('results','check','Results inbox','Saved drafts and deliverables.')+workspaceBody()}
function dictate(){return heading('DICTATE','Speak it. Keep it private.','Use your microphone to turn speech into editable text.')+`<section class="surface dictate-pad"><label for="dictation-text"><strong>Dictation</strong><small>Tap Dictate beside the field, speak, then review before using it.</small></label><textarea id="dictation-text" maxlength="${DICTATION_MAX}" placeholder="Your dictated note will appear here…">${esc(dictationDraft)}</textarea><p id="dictation-status" class="helper" role="status" aria-live="polite">${dictationDraft?'Saved privately to your account.':'Nothing recorded yet.'}</p></section>`}
function assistantSettingsView(kicker,title){return heading(kicker,title)+(window.XtremeAssistantSettings?window.XtremeAssistantSettings.render():`<section class="assist-loading" role="status"><p>${window.XtremeAssistantSettingsFailed?'Your assistant settings could not load. Reload to try again.':'Opening your assistant collection…'}</p>${window.XtremeAssistantSettingsFailed?'<button class="silver-button" data-account="reload">Reload settings</button>':''}</section>`)}
function gallery(){return assistantSettingsView('AVATAR GALLERY','Choose the right presence.')}
function customize(){return assistantSettingsView('CUSTOMIZE','Tune your assistant.')}

function home(){return `<section class="concierge-hero assist-hero phone-hero restored-hero approved-home-hero" aria-labelledby="assistant-name"><div class="assist-hero-copy"><p class="assist-kicker"><span>▸</span> YOUR AI ASSISTANT</p><h1 id="assistant-name">AI <span>Assist</span></h1><span class="hero-title-orbit" aria-hidden="true"></span><p class="hero-phone-line">Voice, video & communications.</p><button class="hero-voice-button" data-route="voice">${icon('mic')}<span>Talk to AI Assist</span>${icon('chevron')}</button></div><div class="approved-crest"><img src="/assets/xps-approved-reference.webp" width="941" height="1671" alt="Xtreme Polishing Systems — Floors For Life"></div></section>
<div class="connect-heading approved-section-heading"><h2>Communication Tools</h2><span aria-hidden="true"></span></div>
<section class="approved-communication" aria-label="Communication tools">
<button class="connection-button" data-route="calls"><span class="connection-icon">${icon('phone')}</span><span class="connection-label"><strong>Dial Pad</strong><small>Enter a number or set up a three-way call.</small></span><span class="connection-arrow">${icon('chevron')}</span></button>
<button class="connection-button" data-route="messages"><span class="connection-icon">${icon('chat')}</span><span class="connection-label"><strong>Messages</strong><small>Write and review your messages.</small></span><span class="connection-arrow">${icon('chevron')}</span></button>
<button class="connection-button" data-route="dictate"><span class="connection-icon">${icon('wave')}</span><span class="connection-label"><strong>Dictation</strong><small>Write as you speak with your device microphone.</small></span><span class="connection-arrow">${icon('chevron')}</span></button>
</section>
<section class="batch-card" aria-labelledby="batch-title"><div class="batch-card-copy"><span class="batch-icon">${icon('people')}</span><span><strong id="batch-title">Batch Contacts</strong><small>Batch execution stays gated until the communications adapter is verified.</small></span></div><div class="batch-actions"><button type="button" disabled aria-label="Batch Calls pending communications verification">${icon('phone')}<span>Batch Calls</span></button><button type="button" disabled aria-label="Batch Messages pending communications verification">${icon('chat')}<span>Batch Messages</span></button></div></section>
<section class="feature-grid" aria-label="Assistant controls">
<button class="feature-tile feature-active" data-route="models">${icon('people')}<span>Models<small>Avatars</small></span></button>
<button class="feature-tile" data-route="gallery">${icon('image')}<span>Avatar<small>Gallery</small></span></button>
<button class="feature-tile" data-route="customize">${icon('settings')}<span>Customize<small>Preferences</small></span></button>
<button class="feature-tile" data-open-session="video" aria-label="Video — Start face-to-face session">${icon('video')}<span>Video<small>Face to face</small></span></button>
</section>
<details class="assistant-more-tools approved-home-more"><summary><span><strong>More tools</strong><small>Tasks, bids, leads & account</small></span>${icon('chevron')}</summary><div class="assistant-more-content">
<button class="requests-link" data-route="prepare"><span>${icon('grid')}<span><strong>Prepare & tasks</strong><small>Calendar, briefings, job folders and results.</small></span></span>${icon('chevron')}</button>
<button class="requests-link" data-route="leads"><span>${icon('search')}<span><strong>Auto Leads</strong><small>Construction lead finder.</small></span></span>${icon('chevron')}</button>
<button class="requests-link" data-route="bid"><span>${icon('bid')}<span><strong>Bid generator</strong><small>Price a job and draft a proposal.</small></span></span>${icon('chevron')}</button>
<button class="requests-link" data-route="connections"><span>${icon('grid')}<span><strong>Connected apps</strong><small>Accounts, permissions and private memory.</small></span></span>${icon('chevron')}</button>
<button class="requests-link" data-route="settings"><span>${icon('settings')}<span><strong>Account</strong><small>Your profile, preferences and access.</small></span></span>${icon('chevron')}</button>
</div></details>`}
function keypadKeys(){return ['1','2','3','4','5','6','7','8','9','*','0','#'].map((k,i)=>`<button class="key" data-key="${k}" aria-label="${k==='*'?'Star':k==='#'?'Hash':k}"><span>${k}</span><small>${['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','+',''][i]||'&nbsp;'}</small></button>`).join('')}
function updateDial(){const input=$('#dial-number');if(input)input.value=dial;document.querySelectorAll('[data-number]').forEach(button=>{button.dataset.number=dial});const error=$('#call-error');if(error)error.textContent=''}

let numberDictation=null;
function dictateControl(){return `<div class="phone-dictation"><button type="button" class="phone-dictate" data-action="dictate-number" id="dial-dictate" aria-label="Dictate a phone number" aria-pressed="false" aria-describedby="dial-dictation-status">${icon('mic')}<span id="dial-dictate-label">Dictate</span><span class="dictate-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></button><p id="dial-dictation-status" role="status" aria-live="polite">Speak a phone number. Your browser may process speech online.</p></div>`}
function dictationMessage(text,listening=false){
 const status=$('#dial-dictation-status'),button=$('#dial-dictate'),label=$('#dial-dictate-label');
 if(status)status.textContent=text;
 if(button){button.setAttribute('aria-pressed',String(listening));button.setAttribute('aria-label',listening?'Stop dictating phone number':'Dictate a phone number');}
 if(label)label.textContent=listening?'Stop dictation':'Dictate';
}
function cancelNumberDictation(message=''){
 const session=numberDictation;if(!session)return;
 numberDictation=null;clearTimeout(session.timer);
 try{session.recognition.abort();}catch{}
 dictationMessage(message||'Dictation stopped. Your number is unchanged.');
}
function spokenPhoneNumber(text){
 const words={zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',plus:'+',star:'*',asterisk:'*',hash:'#',pound:'#'};
 const tokens=String(text).toLowerCase().trim().replace(/^(?:phone number(?: is)?|number(?: is)?|dial|call)\s+/,'').replace(/([+*#])/g,' $1 ').replace(/[\s().,\-–]+/g,' ').trim().split(' ');
 let result='';
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];
  if(token==='double'||token==='triple'){
   const next=tokens[++i],digit=words[next]??next;
   if(!/^[0-9]$/.test(digit??''))return null;
   result+=digit.repeat(token==='double'?2:3);
  }else if(Object.hasOwn(words,token))result+=words[token];
  else if(/^[0-9]+$/.test(token)||/^[+*#]$/.test(token))result+=token;
  else return null;
 }
 return /^\+?[0-9*#]+$/.test(result)&&/[0-9]/.test(result)&&result.length<=24?result:null;
}
function startNumberDictation(){
 if(account.locked||!$('#dial-number'))return;
 window.XtremeVoiceFields?.stop();
 if(window.XtremeAssistantVoice?.isActive?.()){dictationMessage('End your live conversation before dictating a number.');return;}
 if(numberDictation){
  const session=numberDictation;
  if(session.stopping)return;
  session.stopping=true;clearTimeout(session.timer);
  dictationMessage('Finishing dictation…',true);
  session.timer=setTimeout(()=>cancelNumberDictation('Dictation timed out. Your number is unchanged. Try again.'),4000);
  try{session.recognition.stop();}catch{cancelNumberDictation();}
  return;
 }
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){dictationMessage('Voice dictation is not available in this browser. Enter the number below, or use your keyboard microphone if available.');$('#dial-number').focus();return;}
 if(window.isSecureContext===false){dictationMessage('Open the secure Xtreme Avatar site to use the microphone.');return;}
 let recognition;
 try{recognition=new Recognition();}catch{dictationMessage('The microphone could not start. Enter the number or try again.');return;}
 const session={recognition,accountId:account.user?.id,route:route(),number:dial,input:$('#dial-number'),timer:null,stopping:false};
 numberDictation=session;
 const current=()=>numberDictation===session&&!account.locked&&account.user?.id===session.accountId&&route()===session.route&&$('#dial-number')===session.input&&dial===session.number;
 const finish=message=>{if(numberDictation!==session)return;numberDictation=null;clearTimeout(session.timer);try{recognition.abort();}catch{}dictationMessage(message);};
 recognition.lang='en-US';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
 recognition.onstart=()=>{if(numberDictation!==session)return;if(!current()){cancelNumberDictation();return;}dictationMessage('Listening… say each digit, including the country code.',true);};
 recognition.onresult=event=>{
  if(!current()){if(numberDictation===session)cancelNumberDictation();return;}
  const results=Array.from(event.results||[]);
  const transcript=results.map(result=>result[0]?.transcript||'').join(' ').trim();
  if(!results.length||!results.every(result=>result.isFinal)){dictationMessage(transcript?'Hearing: '+transcript.slice(0,100):'Listening…',true);return;}
  const number=spokenPhoneNumber(transcript);
  if(!number){finish('Could not recognize a clear number. Say each digit, or type it below. Your number is unchanged.');return;}
  finish('Number entered. Check every digit before you review the call.');dial=number;updateDial();
 };
 recognition.onerror=event=>{
  if(numberDictation!==session)return;
  const messages={'not-allowed':'Microphone access was denied. Allow microphone access in your browser settings, then try again.','service-not-allowed':'This browser does not allow voice dictation. Enter the number, or use your keyboard microphone if available.','audio-capture':'No microphone is available. Check your device microphone and try again.','network':'Speech recognition could not connect. Check your internet connection and try again.','no-speech':'No speech was detected. Tap Dictate and say each digit.','language-not-supported':'English dictation is not available on this device. Enter the number below.','aborted':'Dictation stopped. Your number is unchanged.'};
  finish(messages[event.error]||'Dictation could not finish. Your number is unchanged. Try again or enter it below.');
 };
 recognition.onend=()=>{if(numberDictation===session)finish('No number was captured. Tap Dictate to try again, or enter it below.');};
 session.timer=setTimeout(()=>cancelNumberDictation('Dictation timed out. Your number is unchanged. Tap Dictate to try again.'),20000);
 dictationMessage('Starting microphone… allow access if your browser asks.',true);
 try{recognition.start();}catch{finish('The microphone could not start. Check browser permissions and try again.');}
}

function voice(){return heading('VOICE','Talk with AI Assist.')+`<section class="voice-space assistant-voice-space" aria-labelledby="assistant-voice-status"><div class="orb-ring"><button class="voice-orb" data-assistant-voice aria-label="Check live voice connection" aria-disabled="true" aria-describedby="assistant-voice-detail">${icon('mic')}</button></div><p id="assistant-voice-status" role="status" aria-live="polite">Voice connection pending</p><small id="assistant-voice-detail">GPT live voice is not connected yet. Your microphone stays off.</small></section>`}
function video(){return heading('VIDEO','Meet your AI assistant.')+`<section class="surface center"><img src="/assets/xps-shield.webp" width="140" height="130" style="object-fit:contain;margin:20px auto" alt="Xtreme Polishing Systems"><button class="gold-button wide" data-open-session="video">${icon('video')} Open Video Studio</button></section>`}
function calls(){return heading('CALL','Who would you like to call?')+`<section class="surface"><label class="eyebrow" for="dial-number">PHONE NUMBER</label><input class="number-input" id="dial-number" type="tel" inputmode="tel" maxlength="24" autocomplete="tel" aria-describedby="dial-number-hint" placeholder="Enter a number" value="${esc(dial)}"><p id="dial-number-hint" class="helper">Default country code +1 (US/Canada). For other countries, enter + and the country code.</p>${dictateControl()}<div class="keypad">${['1','2','3','4','5','6','7','8','9','*','0','#'].map((k,i)=>`<button class="key" data-key="${k}">${k}<small>${['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','+',''][i]||'&nbsp;'}</small></button>`).join('')}</div><div class="dial-actions"><button class="round ghost" data-action="plus-number" aria-label="Add international plus prefix">${icon('plus')}</button><button class="round" data-action="call" aria-label="Call">${icon('phone')}</button><button class="round ghost" data-action="backspace" aria-label="Delete last digit">${icon('back')}</button></div><p class="helper center">Have AI Assist call after you review the recipient and purpose.</p><div class="call-mode-switch"><button data-call="conference">${icon('people')} 3-way call</button><button data-call="resume">Call status</button></div><div id="call-error" class="error" role="alert"></div></section>`}
function chatActive(){
 if(account.locked||!chatOwnerId)return false;
 if(account.user?.id!==chatOwnerId){account.invalidate?.('Your signed-in account changed. Reload to open the correct account.');return false;}
 return true;
}
function chatStatusText(){
 if(chatSent&&!chatDraft)return chatSaveState==='error'?'Message sent. The saved draft could not be cleared; it may reappear after reloading.':chatSaveState==='saving'?'Message sent. Clearing saved draft…':'Message sent.';
 if(chatSaveState==='error')return 'Draft not saved. Keep this page open and copy your text before reloading. · Not sent';
 if(chatSaveState==='saving')return 'Saving private draft… · Not sent';
 if(chatNotice)return chatNotice;
 if(chatSaveState==='saved')return chatDraft?'Draft saved privately · Not sent':'Draft cleared · Not sent';
 return 'Drafts stay private · Nothing sent';
}
function updateChatStatus(){const status=$('#assistant-chat-save-status');if(status)status.textContent=chatStatusText();}
async function persistChatDraft(){
 if(!chatActive())return false;
 const revision=++chatRevision,snapshot=chatDraft;
 chatSaveState='saving';chatNotice='';updateChatStatus();
 let ok=false;try{ok=await account.save('assistant_chat_draft',snapshot);}catch{}
 if(!chatActive()||revision!==chatRevision)return false;
 chatSaveState=ok?'saved':'error';updateChatStatus();return Boolean(ok);
}
window.XtremeChatDraft={
 get value(){return chatActive()?chatDraft:'';},
 get ownerId(){return chatOwnerId;},
 sent(message){if(!chatActive()||chatDraft!==message)return;chatDraft='';chatSent=true;const input=$('#assistant-chat-input');if(input)input.value='';void persistChatDraft();}
};
function messages(){return `<section class="assistant-chat" aria-labelledby="assistant-chat-name"><div class="page-top"><button class="back-button" data-route="home" aria-label="Back to home">‹ <span>Back</span></button><span class="eyebrow">CHAT</span></div><header class="assistant-chat-header"><span class="assistant-chat-mark" aria-hidden="true">${icon('chat')}</span><div><h1 id="assistant-chat-name">AI Assist</h1><p id="assistant-chat-connection"><span aria-hidden="true"></span>AI connection pending</p></div><span class="assistant-chat-private">${icon('lock')} Private</span></header><div class="assistant-chat-body" aria-label="Conversation"><div class="assistant-chat-empty"><span class="assistant-chat-spark" aria-hidden="true">✦</span><h2>What can we work on?</h2><p>Start with an idea, a question,<br>or something you need handled.</p></div><div class="assistant-chat-prompts" aria-label="Start a draft">${Object.entries(chatPrompts).map(([key,prompt])=>`<button type="button" data-chat-prompt="${key}">${esc(prompt[0])}${icon('arrow')}</button>`).join('')}</div><p class="assistant-chat-empty-note">Your conversation will appear here once AI Assist is connected.</p></div><form id="assistant-chat-form" class="assistant-chat-compose" aria-describedby="assistant-chat-connection assistant-chat-save-status"><label class="sr-only" for="assistant-chat-input">Message AI Assist</label><div class="assistant-chat-input-row"><textarea id="assistant-chat-input" rows="3" maxlength="${CHAT_MAX}" placeholder="Message AI Assist…" autocomplete="off">${esc(chatDraft)}</textarea><button type="submit" class="assistant-chat-send" disabled aria-label="Send message — AI connection pending" title="AI connection pending">${icon('arrow')}</button></div><p id="assistant-chat-save-status" role="status" aria-live="polite">${esc(chatStatusText())}</p></form></section>`}
function sms(){return heading('SMS DRAFTS','Write a message.')+`<form class="surface" id="message-form"><span class="badge" id="draft-status">Private draft</span><label class="field" for="message-to">To<input id="message-to" type="tel" inputmode="tel" maxlength="24" autocomplete="tel" value="${esc(draft.to)}" placeholder="Phone number" required></label><label class="field" for="message-body">Message<textarea id="message-body" maxlength="3000" rows="6" placeholder="Write your message…" required>${esc(draft.body)}</textarea></label><button class="gold-button wide" type="submit">${icon('chat')} Save draft</button><p class="helper">Private SMS drafts only. Sending is not connected yet.</p></form>`}
function settings(){return heading('SETTINGS','Your assistant, your rules.')+account.panel()+(window.XtremeOwnerControls?window.XtremeOwnerControls.render():`<section class="assist-loading" role="status"><p>${window.XtremeOwnerControlsFailed?'Owner controls could not load. Reload to try again.':'Opening Owner Control Center…'}</p>${window.XtremeOwnerControlsFailed?'<button class="silver-button" data-account="reload">Reload settings</button>':''}</section>`)+tool('models','people','AI avatars & skills','Choose your assistant personality, specialty and assistance style.')+tool('connections','grid','Connected apps','Connect accounts and verify provider access.')+`<section class="surface"><label class="field" for="profile-name">Your name<input id="profile-name" maxlength="40" autocomplete="given-name" value="${esc(profile.name)}" placeholder="Your name"></label><span class="helper" id="profile-status" role="status"></span></section><button class="text-button" data-action="install">${icon('plus')} Add to Home Screen</button>`}


function models(){return heading('YOUR ASSISTANT','Make it yours.')+(window.XtremeAssistantSettings?window.XtremeAssistantSettings.render():`<section class="assist-loading" role="status"><p>${window.XtremeAssistantSettingsFailed?'Your assistant settings could not load. Reload to try again.':'Opening your assistant collection…'}</p>${window.XtremeAssistantSettingsFailed?'<button class="silver-button" data-account="reload">Reload settings</button>':''}</section>`)}
function calendar(){return `<div class="page-top"><button class="back-button" data-route="workspace" aria-label="Back to Tasks">‹ <span>Back</span></button></div>`+(window.XtremeJobCalendar?window.XtremeJobCalendar.render():`<section class="assist-loading" role="status"><h2>Your calendar</h2><p>${window.XtremeJobCalendarFailed?'Calendar could not load. Reload to try again.':'Opening Calendar & jobs…'}</p>${window.XtremeJobCalendarFailed?'<button class="silver-button" data-account="reload">Reload calendar</button>':''}</section>`)}
function connections(){return heading('CONNECTED APPS','Bring your apps together.')+(window.XtremeGoogleWorkspace?window.XtremeGoogleWorkspace.render():`<section class="assist-loading" role="status"><p>${window.XtremeGoogleWorkspaceFailed?'Connected apps could not load. Reload to try again.':'Opening your connected apps…'}</p>${window.XtremeGoogleWorkspaceFailed?'<button class="silver-button" data-account="reload">Reload connections</button>':''}</section>`)}

function render(){if(account.locked)return;cancelNumberDictation();const current=route();const views={home,prepare,dictate,voice,calls,messages,sms,video,settings,models,gallery,customize,connections,calendar,workspace,projects,results,briefing,prediction,simulation,bid,leads};$('#main').innerHTML=views[current]();const prepareActive=['prepare','calendar','workspace','projects','results','briefing'].includes(current);$('#bottom-nav').innerHTML=nav.map(([r,ic,label])=>{const active=current===r||(r==='prepare'&&prepareActive);return `<button class="nav-item${active?' active':''}" ${r==='video'?'data-open-session="video"':`data-route="${r}"`}${active?' aria-current="page"':''}>${icon(ic)}<span>${label}</span></button>`}).join('');document.title=(current==='home'?'Xtreme Avatar':({prepare:'Prepare',dictate:'Dictate',messages:'Messages',sms:'SMS drafts',workspace:'Tasks',models:'Models',gallery:'Avatar Gallery',customize:'Customize',connections:'Connected apps',calendar:'Calendar & jobs',projects:'Job folders',results:'Results inbox',briefing:'Today’s briefing'}[current]||current[0].toUpperCase()+current.slice(1))+' · Xtreme Avatar')+' · XPS Intelligence';if(current==='messages')window.XtremeAssistantChat?.render();if(current==='voice')window.XtremeAssistantVoice?.render();if(['projects','results','briefing'].includes(current))window.XtremeWorkHub?.activate(current);if(current==='calendar')window.XtremeJobCalendar?.activate()}
function modal(html){if(account.locked)return;$('#sheet-content').innerHTML=html;$('#sheet').showModal()}
function videoModuleNotice(){
 const state=window.XtremeVideoModule?.state;
 if(state==='ready'){if($('#video-module-status')){$('#sheet').close();$('#sheet-content').replaceChildren();toast('Video Studio is ready. Tap Video to start.');}return;}
 const failed=state==='error',slow=state==='slow';
 modal(`<section id="video-module-status" role="status" aria-live="polite"><h2>${failed?'Video Studio couldn’t load':slow?'Video Studio is taking longer to load':'Opening Video Studio…'}</h2><p>${failed?'Check your connection, then try again.':slow?'You can close this message and try again in a moment, or reload the app.':'The video controls are loading. Your microphone and camera are off.'}</p>${failed?'<button class="silver-button wide" data-video-retry>Retry Video Studio</button>':slow?'<button class="silver-button wide" data-account="reload">Reload app</button>':''}</section>`);
}
document.addEventListener('click',e=>{
 if(account.locked)return;
 if(e.target.closest('[data-video-retry]')){e.preventDefault();window.XtremeVideoModule?.retry();videoModuleNotice();return;}
 if(e.target.closest('[data-open-session]')&&window.XtremeVideoModule?.state!=='ready'){e.preventDefault();videoModuleNotice();}
});
window.addEventListener('xtreme:video-module',()=>{if(!account.locked&&$('#sheet').open&&$('#video-module-status'))videoModuleNotice();});
async function persistDraft(){if(account.locked)return false;const revision=++draftRevision,snapshot={...draft};const ok=await account.save('draft',snapshot);if(account.locked)return false;if(revision===draftRevision&&$('#draft-status'))$('#draft-status').textContent=ok?'Draft saved':'Not saved — keep this page open';return ok}
async function persistDictation(){if(account.locked)return false;const revision=++dictationRevision,snapshot=dictationDraft;const ok=await account.save('transcript',snapshot);if(!account.locked&&revision===dictationRevision&&$('#dictation-status'))$('#dictation-status').textContent=ok?'Saved privately to your account.':'Not saved — keep this page open.';return ok}
document.addEventListener('input',async e=>{if(account.locked)return;const id=e.target.id;if(id==='assistant-chat-input'){if(!chatActive())return;chatSent=false;chatDraft=e.target.value.slice(0,CHAT_MAX);if(e.target.value!==chatDraft)e.target.value=chatDraft;void persistChatDraft();return}if(id==='dictation-text'){dictationDraft=e.target.value.slice(0,DICTATION_MAX);if(e.target.value!==dictationDraft)e.target.value=dictationDraft;const status=$('#dictation-status');if(status)status.textContent='Saving…';void persistDictation();return}if(id==='dial-number'){cancelNumberDictation('Number edited. Dictation stopped.');dial=e.target.value.slice(0,24);updateDial()}if(id==='message-to'||id==='message-body'){draft={...draft,to:$('#message-to').value,body:$('#message-body').value};$('#draft-status').textContent='Saving…';void persistDraft()}if(id==='profile-name'){profile={name:e.target.value.slice(0,40)};const revision=++profileRevision;const ok=await account.save('profile',{...profile});if(!account.locked&&revision===profileRevision&&$('#profile-status'))$('#profile-status').textContent=ok?'Saved':'Not saved — keep this page open'}});
document.addEventListener('submit',async e=>{if(e.target.id==='assistant-chat-form'){e.preventDefault();if(window.XtremeAssistantChat){void window.XtremeAssistantChat.submit();return;}if(chatActive()){chatNotice='AI connection pending. Your draft has not been sent.';updateChatStatus();}return}if(e.target.id!=='message-form')return;e.preventDefault();if(account.locked)return;const ok=await persistDraft();if(ok)toast('Draft saved.')});
document.addEventListener('click',async e=>{if(account.locked)return;const prompt=e.target.closest('[data-chat-prompt]');if(prompt){e.preventDefault();if(!chatActive()||!Object.hasOwn(chatPrompts,prompt.dataset.chatPrompt))return;const input=$('#assistant-chat-input');if(!input)return;const next=chatDraft.trim()?chatDraft+'\n\n'+chatPrompts[prompt.dataset.chatPrompt][1]:chatPrompts[prompt.dataset.chatPrompt][1];if(next.length>CHAT_MAX){chatNotice='Your draft is full. Shorten it before adding a prompt. · Not sent';updateChatStatus();input.focus();return}chatSent=false;chatDraft=next;input.value=chatDraft;input.focus();void persistChatDraft();return}if(e.target.closest('.skip')){e.preventDefault();$('#main').focus();return}const r=e.target.closest('[data-route]');if(r){if(r.dataset.work&&!window.XtremeWork){toast(window.XtremeWorkFailed?'Your workspace could not load. Open Tasks to reload.':'Your workspace is loading. Try again in a moment.');return}go(r.dataset.route);return}const k=e.target.closest('[data-key]');if(k){cancelNumberDictation('Number edited. Dictation stopped.');if(dial.length<24)dial+=k.dataset.key;updateDial();return}if(e.target.closest('[data-call]')&&!window.XtremeCalling){toast(window.XtremeCallingFailed?'The call desk could not load. Reload this app to try again.':'The call desk is loading. Try again in a moment.');return}if(e.target.closest('[data-assistant-voice]')&&!window.XtremeAssistantVoice){toast('GPT live voice is awaiting connection. Your microphone is off.');return}const action=e.target.closest('[data-action]')?.dataset.action;if(action==='dictate-number'){startNumberDictation();return}if(action==='plus-number'){cancelNumberDictation('Number edited. Dictation stopped.');if(!dial.startsWith('+')&&dial.length<24)dial='+'+dial;updateDial()}if(action==='backspace'){cancelNumberDictation('Number edited. Dictation stopped.');dial=dial.slice(0,-1);updateDial()}if(action==='call'){cancelNumberDictation();const number=window.XtremePhone.normalize(dial);if(!number){$('#call-error').textContent='Enter a 10-digit US/Canada number, or use + and the country code for another country.';return}if(window.XtremeCalling)window.XtremeCalling.reviewNumber(number);else toast(window.XtremeCallingFailed?'The call desk could not load. Reload this app to try again.':'The call desk is loading. Try again in a moment.')}if(action==='install'){if(window.XtremePWA)window.XtremePWA.showInstall();else modal('<h2>Install Xtreme Avatar</h2><p>Open your browser menu or Share menu and choose Add to Home Screen.</p>')}});
window.addEventListener('xtreme:assistant-settings-ready',()=>{if(!account.locked&&route()==='models')render()});
window.addEventListener('xtreme:assistant-settings-changed',()=>{if(!account.locked&&route()==='models')render()});
window.addEventListener('xtreme:google-workspace-ready',()=>{if(!account.locked&&route()==='connections')render()});
window.addEventListener('xtreme:google-workspace-changed',()=>{if(!account.locked&&route()==='connections')render()});
window.addEventListener('xtreme:assistant-prompt',e=>{
 if(!chatActive()||typeof e.detail?.prompt!=='string'||!e.detail.prompt.trim())return;
 const next=chatDraft.trim()?chatDraft+'\n\n'+e.detail.prompt:e.detail.prompt;
 if(next.length>CHAT_MAX){toast('Your chat draft is full. Shorten it before adding another prompt.');go('messages');return;}
 chatDraft=next;chatSent=false;go('messages');void persistChatDraft();$('#assistant-chat-input')?.focus();
});
window.addEventListener('xtreme:work-ready',()=>{if(!account.locked&&['home','workspace'].includes(route()))render()});
window.addEventListener('xtreme:work-changed',()=>{if(!account.locked&&['home','workspace'].includes(route()))render()});
window.addEventListener('xtreme:decisions-ready',()=>{if(!account.locked&&['prediction','simulation'].includes(route()))render()});
window.addEventListener('xtreme:decisions-changed',()=>{if(!account.locked&&['prediction','simulation'].includes(route())){render();const result=$('#'+route()+'-results');if(result?.textContent?.trim())result.scrollIntoView?.({block:'start',behavior:'smooth'})}});
window.addEventListener('xtreme:bid-ready',()=>{if(!account.locked&&route()==='bid')render()});
window.addEventListener('xtreme:bid-changed',()=>{if(!account.locked&&route()==='bid'){render();const result=$('#bid-results');if(result?.textContent?.trim())result.scrollIntoView?.({block:'start',behavior:'smooth'})}});
window.addEventListener('hashchange',()=>{if(account.locked)return;render();window.scrollTo(0,0);$('#main').focus({preventScroll:true})});
window.addEventListener('xtreme:field-dictation-start',()=>cancelNumberDictation());
window.addEventListener('xtreme:account-ended',()=>{cancelNumberDictation();clearTimeout(toast.timer);draftRevision++;profileRevision++;chatRevision++;dictationRevision++;dictationDraft='';chatDraft='';chatSent=false;chatSaveState='empty';chatNotice='';const chatInput=$('#assistant-chat-input');if(chatInput)chatInput.value='';updateChatStatus();profile={name:''};draft={to:'',body:'',channel:'SMS'};dial='';$('#toast').textContent='';$('#toast').classList.remove('show')});
document.addEventListener('click',e=>{if(e.target.closest('[data-open-session]')||e.target.closest('[data-call]')||e.target.closest('[data-action="call"]')){cancelNumberDictation();window.XtremeAssistantVoice?.stop();}},true);
document.addEventListener('toggle',event=>{if(event.target.matches?.('.assistant-more-tools')&&!event.target.open)cancelNumberDictation();},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cancelNumberDictation();});
window.addEventListener('pagehide',()=>cancelNumberDictation());
render();

window.addEventListener('xtreme:work-hub-ready',()=>{if(!account.locked&&['projects','results','briefing'].includes(route()))render()});
window.addEventListener('xtreme:work-hub-changed',()=>{if(!account.locked&&['projects','results','briefing'].includes(route()))render()});
window.addEventListener('xtreme:job-calendar-ready',()=>{if(!account.locked&&route()==='calendar')render()});

document.addEventListener('submit',e=>{if(['call-prepare-form','call-confirm-form'].includes(e.target.id)){cancelNumberDictation();window.XtremeAssistantVoice?.stop();}},true);

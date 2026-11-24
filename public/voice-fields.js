import {convertDictation,mergeDictation} from './voice-field-values.js';

// One account-bound microphone at a time. This layer fills fields, never clicks
// submit, approves permissions, initiates calls, or starts background listening.
const account=window.XtremeAccount,owner=account?.user?.id;
if(owner&&!account.locked&&!window.XtremeVoiceFields){
 const records=new Map();let dead=false,session=null,scheduled=false,serial=0;
 const current=()=>!dead&&!account.locked&&account.user?.id===owner;
 const allowed=new Set(['text','search','email','url','tel','number','date','time','datetime-local','range']);
 const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
 function eligible(field){
  if(!field?.isConnected||field.disabled||field.readOnly||field.hidden||field.id==='dial-number'||field.closest('[data-voice-ignore],[inert],[hidden]'))return false;
  if(/password|one-time-code|cc-number|cc-csc/i.test(field.autocomplete||'')||/(?:password|secret|api[-_]?key|access[-_]?token)/i.test(field.name||field.id||''))return false;
  return field.tagName==='TEXTAREA'||field.tagName==='SELECT'&&!field.multiple||field.tagName==='INPUT'&&allowed.has(field.type||'text');
 }
 function label(field){return (field.getAttribute('aria-label')||field.labels?.[0]?.textContent||field.placeholder||field.name||'this field').trim().replace(/\s+/g,' ').slice(0,90);}
 function status(record,text,listening=false){record.status.textContent=text;record.button.setAttribute('aria-pressed',String(listening));record.caption.textContent=listening?'Stop':'Dictate';record.button.setAttribute('aria-label',(listening?'Stop dictating ':'Dictate ')+record.label);}
 function cancel(message='Dictation stopped.'){const old=session;if(!old)return;session=null;clearTimeout(old.timer);try{old.recognition.abort();}catch{}status(old.record,message);}
 function alive(s){return session===s&&current()&&eligible(s.field)&&location.hash===s.route&&s.field.value===s.original;}
 function start(record){
  if(!current()||!eligible(record.field))return;
  if(session?.record===record){const s=session;status(record,'Finishing dictation…',true);clearTimeout(s.timer);s.timer=setTimeout(()=>cancel('No final words were captured. Try again.'),4000);try{s.recognition.stop();}catch{cancel();}return;}
  cancel();const field=record.field;
  if(window.XtremeAssistantVoice?.isActive?.()||document.querySelector('.tavus-layer[open]')){status(record,'End your live conversation before dictating into a field.');return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){status(record,'Use your keyboard’s microphone or device voice control; in-app dictation is unavailable in this browser.');field.focus();return;}
  if(window.isSecureContext===false){status(record,'Open the secure app address to use your microphone.');return;}
  window.dispatchEvent(new Event('xtreme:field-dictation-start'));
  let recognition;try{recognition=new Recognition();}catch{status(record,'The microphone could not start. Use your keyboard microphone or try again.');return;}
  const s={record,field,recognition,route:location.hash,original:field.value,start:field.selectionStart,end:field.selectionEnd};session=s;
  recognition.lang=field.lang||document.documentElement.lang||'en-US';recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
  recognition.onstart=()=>{if(!alive(s)){if(session===s)cancel();return;}status(record,'Listening. Your browser may process speech online.',true);};
  recognition.onresult=event=>{
   if(!alive(s)){if(session===s)cancel('The field changed. Your dictated words were not inserted.');return;}
   const results=Array.from(event.results||[]),text=results.map(result=>result[0]?.transcript||'').join(' ').trim();
   if(!results.length||!results.every(result=>result.isFinal)){status(record,text?'Hearing: '+text.slice(0,160):'Listening…',true);return;}
   const type=field.tagName==='SELECT'?'select':field.tagName==='TEXTAREA'?'text':field.type||'text';
   let converted=convertDictation(text,{type,options:Array.from(field.options||[]).map(o=>({label:o.label||o.textContent,value:o.value,disabled:o.disabled}))});
   if(!converted.error&&['text','search'].includes(type))converted=mergeDictation(s.original,converted.value,{start:s.start,end:s.end,maxLength:field.maxLength});
   if(!converted.error&&field.maxLength>=0&&converted.value.length>field.maxLength)converted={error:'That entry is too long for this field. Try a shorter entry.'};
   if(converted.error){cancel(converted.error);return;}
   // Validate with the actual browser control before notifying existing app code.
   field.value=converted.value;
   if(field.value!==converted.value||field.validity?.rangeUnderflow||field.validity?.rangeOverflow||field.validity?.stepMismatch||field.validity?.typeMismatch||field.validity?.patternMismatch){field.value=s.original;cancel('That value is not valid for this field. Check its format or range and try again.');return;}
   cancel('Added. Review the entry before continuing.');
   field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
   if(field.isConnected){field.focus({preventScroll:true});try{field.setSelectionRange(field.value.length,field.value.length);}catch{}}
  };
  recognition.onerror=event=>{if(session!==s)return;const errors={'not-allowed':'Microphone access was denied. Allow it in browser settings, or use your keyboard microphone.','service-not-allowed':'This browser cannot use dictation. Use your keyboard microphone.','audio-capture':'No microphone is available. Check your microphone and try again.','network':'Dictation could not connect. Check your internet connection and try again.','no-speech':'No speech was detected. Tap Dictate to try again.','language-not-supported':'This language is unavailable. Use your keyboard microphone.'};cancel(errors[event.error]||'Dictation stopped. Try again when ready.');};
  recognition.onend=()=>{if(session===s)cancel('No final words were captured. Tap Dictate to try again.');};
  s.timer=setTimeout(()=>{if(session===s)cancel('Dictation timed out. Tap Dictate to continue.');},30000);
  status(record,'Starting microphone… allow access if asked.',true);try{recognition.start();}catch{cancel('The microphone could not start. Try again or use your keyboard microphone.');}
 }
 function scan(){
  scheduled=false;if(!current())return;
  if(session&&!alive(session))cancel('The field changed. Dictation stopped.');
  for(const [field,record] of records){if(!field.isConnected||!record.tools.isConnected){if(session?.record===record)cancel();record.tools.remove();records.delete(field);}else{record.tools.hidden=!eligible(field);record.button.disabled=!eligible(field);}}
  for(const field of document.querySelectorAll('input,textarea,select')){
   if(!eligible(field)||records.has(field))continue;
   const tools=document.createElement('span'),button=document.createElement('button'),caption=document.createElement('span'),notice=document.createElement('span');
   const record={field,tools,button,caption,status:notice,label:label(field)};
   tools.className='voice-field-tools';button.className='voice-field-button';button.type='button';button.innerHTML=icon;button.append(caption);notice.className='voice-field-status';notice.id='voice-field-status-'+(++serial);notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');button.setAttribute('aria-describedby',notice.id);status(record,'');tools.append(button,notice);field.insertAdjacentElement('afterend',tools);records.set(field,record);
   button.addEventListener('click',event=>{event.preventDefault();start(record);});
  }
 }
 const schedule=()=>{if(!scheduled&&current()){scheduled=true;queueMicrotask(scan);}};
 const observer=new MutationObserver(schedule);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','readonly','hidden','inert','type']});
 document.addEventListener('input',event=>{if(session?.field===event.target)cancel('Entry edited. Dictation stopped.');},true);
 document.addEventListener('click',event=>{if(event.target.closest?.('[data-open-session],[data-call],[data-assistant-voice],[data-action="dictate-number"],[data-route]'))cancel();},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape')cancel();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cancel();});
 window.addEventListener('hashchange',()=>cancel());window.addEventListener('pagehide',()=>cancel());
 window.addEventListener('xtreme:account-ended',()=>{cancel();dead=true;observer.disconnect();for(const record of records.values())record.tools.remove();records.clear();});
 window.XtremeVoiceFields=Object.freeze({refresh:scan,stop:cancel,isListening:()=>!!session});scan();
}

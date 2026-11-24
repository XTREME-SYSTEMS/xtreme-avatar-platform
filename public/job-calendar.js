/* Account-private Calendar workspace. Google changes require a reviewed, explicit commit. */
(() => {
'use strict';
const account=window.XtremeAccount,owner=account?.user?.id;
const API='/api/connections/google/calendar/',STORAGE='xtreme.calendar.operation';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stages={lead:'Lead',estimating:'Estimating',scheduled:'Scheduled',active:'In progress',complete:'Complete'};
const icons={calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18"/>',plus:'<path d="M12 4v16M4 12h16"/>',left:'<path d="m15 5-7 7 7 7"/>',right:'<path d="m9 5 7 7-7 7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',photo:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 18 6-6 4 4 4-5 4 5"/>',file:'<path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h5"/>',refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.calendar)+'</svg>';
const messages={calendar_disabled:'Calendar is not enabled for this app yet.',calendar_api_disabled:'Your administrator needs to enable the Google Calendar API.',calendar_scope_required:'Approve Calendar read access in Connected apps.',calendar_reconnect_required:'Reconnect Google in Connected apps.',reconnect_required:'Reconnect Google in Connected apps.',connection_changed:'Your Google connection changed. Refresh before continuing.',connection_revision_required:'Refresh your Google connection before continuing.',calendar_rate_limited:'Google has limited requests. Wait a moment before refreshing.',calendar_timeout:'Google took too long. Check save status before trying a save again.',calendar_unavailable:'Google Calendar is temporarily unavailable.',setup_required:'Your administrator must finish Google setup.',account_changed:'Your signed-in account changed.',conflict:'This item changed. Refresh before saving again.',version_conflict:'This item changed. Refresh before saving again.',file_too_large:'Choose a file no larger than 4 MB.',unsupported_file:'Choose a JPEG, PNG, WebP or PDF.',quota_exceeded:'Your file storage limit has been reached.',calendar_manage_required:'Enable Calendar editing in Connected apps first.',calendar_existing_operation:'A previous save is still unconfirmed. Check its status before saving again.'};
const controllers=new Set(),drawerControllers=new Set(),urls=new Set(),photos=new Map();
let generation=0,drawerGeneration=0,ended=false,status=null,loading=false,notice='',view='month',anchor='',selected='',range=null,events=[],nextCursor=null,hasMore=false,capped=false,drawer=null,projects=[],pending=null,queuedAction=null,allowNavigation=false;
function active(){const ok=!ended&&owner&&!account?.locked&&account.user?.id===owner;if(!ok)clearPrivate();return !!ok;}
function onPage(){return active()&&location.hash==='#calendar';}
function root(){return document.querySelector('#job-calendar-root');}
function zone(){return status?.timeZone||range?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}
const dateOK=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
function dayAdd(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function parts(instant,tz=zone()){return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
function localDay(instant,tz=zone()){const p=parts(instant,tz);return p.year+'-'+p.month+'-'+p.day;}
function today(){return localDay(Date.now());}
function dayLabel(day,options={weekday:'long',month:'long',day:'numeric'}){return new Intl.DateTimeFormat(undefined,{...options,timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));}
function localInstant(day,time,tz=zone(),boundary=false){
 if(!dateOK(day)||!/^\d{2}:\d{2}$/.test(time))throw Error('Choose a valid date and time.');
 const [hh,mm]=time.split(':').map(Number);if(hh>23||mm>59)throw Error('Choose a valid time.');
 const target=Date.parse(day+'T'+time+':00Z'),matches=[];
 for(let offset=-840;offset<=840;offset+=15){const candidate=target-offset*60000,p=parts(candidate,tz);if(p.year+'-'+p.month+'-'+p.day===day&&Number(p.hour)===hh&&Number(p.minute)===mm)matches.push(candidate);}
 if(!matches.length){if(boundary&&hh<4)return localInstant(day,String(hh+1).padStart(2,'0')+':00',tz,true);throw Error('That local time does not exist because the clocks change. Choose another time.');}
 if(matches.length>1&&!boundary)throw Error('That local time occurs twice when the clocks change. Choose a time outside the repeated hour.');
 return new Date(Math.min(...matches)).toISOString();
}
function displayTime(instant){return new Intl.DateTimeFormat(undefined,{timeZone:zone(),hour:'numeric',minute:'2-digit'}).format(new Date(instant));}
function when(event){
 if(event.allDay){const last=dayAdd(event.end,-1);return dayLabel(event.start,{month:'short',day:'numeric',year:'numeric'})+(last!==event.start?' – '+dayLabel(last,{month:'short',day:'numeric',year:'numeric'}):'')+' · All day';}
 return new Intl.DateTimeFormat(undefined,{timeZone:event.timeZone||zone(),weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(event.start))+' – '+new Intl.DateTimeFormat(undefined,{timeZone:event.timeZone||zone(),hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(event.end));
}
function windowDays(){
 const first=anchor.slice(0,7)+'-01',weekday=new Date(first+'T12:00:00Z').getUTCDay();
 const start=view==='month'?dayAdd(first,-weekday):view==='week'?dayAdd(anchor,-new Date(anchor+'T12:00:00Z').getUTCDay()):anchor;
 return Array.from({length:view==='month'?42:view==='week'?7:1},(_,i)=>dayAdd(start,i));
}
function readEnabled(){return !!(status?.state==='connected'&&status.services?.some(s=>s.id==='calendar'&&s.authorized&&s.enabled));}
function canCreate(){return readEnabled()&&status.calendarAccess==='manage'&&status.calendarCapabilities?.create===true&&!pending;}
function clearURLs(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();for(const photo of photos.values())photo.close();photos.clear();}
function clearPrivate(){try{savePending(null);}catch{}queuedAction=null;generation++;drawerGeneration++;for(const c of controllers)c.abort();controllers.clear();clearURLs();status=null;range=null;events=[];projects=[];drawer=null;loading=false;notice='';nextCursor=null;hasMore=false;capped=false;document.querySelector('#job-calendar-drawer')?.remove();root()?.replaceChildren();document.querySelector('.app-shell')?.classList.remove('job-calendar-mode');}
function leave(){queuedAction=null;generation++;drawerGeneration++;for(const c of controllers)c.abort();controllers.clear();clearURLs();events=[];range=null;status=null;projects=[];drawer=null;loading=false;document.querySelector('#job-calendar-drawer')?.remove();document.querySelector('.app-shell')?.classList.remove('job-calendar-mode');}
function savePending(value){pending=value;if(value)sessionStorage.setItem(STORAGE,JSON.stringify(value));else sessionStorage.removeItem(STORAGE);}
try{const saved=JSON.parse(sessionStorage.getItem(STORAGE)||'null');if(saved&&saved.ownerId===owner&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(saved.requestId)&&Number.isSafeInteger(saved.connectionRevision)&&saved.connectionRevision>0)pending=saved;else sessionStorage.removeItem(STORAGE);}catch{/* Memory-only reads remain available. */}
async function request(path,{body,method,revision=status?.revision,raw=false,blob=false,drawerBound=false}={}){
 if(!active())throw Error('Sign in again.');
 const stamp=generation,controller=new AbortController();controllers.add(controller);if(drawerBound)drawerControllers.add(controller);const timer=setTimeout(()=>controller.abort(),path.startsWith('/api/calendar/')?115000:85000);
 try{
  const response=await fetch(path,{method:method||(body===undefined?'GET':'POST'),credentials:'same-origin',cache:'no-store',headers:{'X-Xtreme-Account':owner,...(revision?{'X-Xtreme-Connection-Revision':String(revision)}:{}),...(body===undefined?{}:{'Content-Type':raw?'application/octet-stream':'application/json'})},body:body===undefined?undefined:raw?body:JSON.stringify(body),signal:controller.signal});
  const data=blob&&response.ok?await response.blob():await response.json();
  if(stamp!==generation||!active())throw Object.assign(Error('This view changed.'),{stale:true});
  if(!response.ok){if(response.status===401||data?.code==='account_changed'){account.invalidate?.('Your account session changed. Sign in again.',response.status===401);}throw Object.assign(Error(messages[data?.code]||'The request could not be confirmed. Refresh its status before trying again.'),{code:typeof data?.code==='string'?data.code:'request_failed',terminal:data?.terminal===true,requestId:typeof data?.requestId==='string'?data.requestId:null,recoveryRequestId:typeof data?.recoveryRequestId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(data.recoveryRequestId)?data.recoveryRequestId:null});}
  return data;
 }catch(error){if(error.name==='AbortError')throw Object.assign(Error('The request took too long. Check its status before trying again.'),{code:'timeout',terminal:false});throw error;}
 finally{clearTimeout(timer);controllers.delete(controller);drawerControllers.delete(controller);}
}
function verifyStatus(data){
 if(!data||typeof data.configured!=='boolean'||!Array.isArray(data.services)||!['connected','disconnected','setup_required','unavailable','reconnect_required'].includes(data.state)||!Number.isSafeInteger(data.revision)||data.revision<0)throw Error('Google status could not be verified.');
 if(data.state==='connected'&&(!data.account||typeof data.account.email!=='string'||data.revision<1))throw Error('Google account could not be verified.');
 return data;
}
function verifyEvent(e,detail=false){
 if(!e||typeof e.id!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(e.id)||typeof e.eventRef!=='string'||!/^ce1_[a-f0-9]{64}$/.test(e.eventRef)||typeof e.title!=='string'||e.title.length>200||typeof e.location!=='string'||e.location.length>300||typeof e.allDay!=='boolean')throw Error('Appointment could not be verified.');
 if(e.allDay?(!dateOK(e.start)||!dateOK(e.end)||e.end<=e.start):(!Number.isFinite(Date.parse(e.start))||!Number.isFinite(Date.parse(e.end))||Date.parse(e.end)<=Date.parse(e.start)))throw Error('Appointment dates could not be verified.');
 if(detail&&(typeof e.editable!=='boolean'||typeof e.notes!=='string'||e.notes.length>4000||typeof e.etag!=='string'))throw Error('Appointment details could not be verified.');
 return {...e};
}
async function loadCalendar(more=false){
 if(!onPage()||loading||drawer?.busy)return;loading=true;notice='';renderView();const stamp=generation;
 try{
  if(!more){
   const checked=verifyStatus(await request('/api/connections/google/status',{revision:null}));if(stamp!==generation)return;
   if(status?.revision&&status.revision!==checked.revision){events=[];range=null;closeDrawer(true);}
   if(status?.revision===checked.revision&&status.timeZone)checked.timeZone=status.timeZone;status=checked;if(!anchor)anchor=today();if(!selected)selected=anchor;
   if(!readEnabled()){events=[];range=null;return;}
   const days=windowDays();range={rangeStart:localInstant(days[0],'00:00',zone(),true),rangeEnd:localInstant(dayAdd(days.at(-1),1),'00:00',zone(),true),timeZone:zone()};events=[];nextCursor=null;hasMore=false;
  }
  if(!readEnabled()||!range)return;
  let data=await request(API+'range',{body:{rangeStart:range.rangeStart,rangeEnd:range.rangeEnd,...(more&&nextCursor?{cursor:nextCursor}:{})}});
  if(stamp!==generation)return;
  if(data?.state!=='ready'||!Array.isArray(data.events)||data.events.length>250||typeof data.timeZone!=='string'||typeof data.hasMore!=='boolean'||typeof data.capped!=='boolean')throw Error('Calendar response could not be verified.');
  new Intl.DateTimeFormat(undefined,{timeZone:data.timeZone}).format(0);
  if(!more&&data.timeZone!==range.timeZone){const days=windowDays();range={rangeStart:localInstant(days[0],'00:00',data.timeZone,true),rangeEnd:localInstant(dayAdd(days.at(-1),1),'00:00',data.timeZone,true),timeZone:data.timeZone};data=await request(API+'range',{body:{rangeStart:range.rangeStart,rangeEnd:range.rangeEnd}});if(stamp!==generation)return;if(data?.state!=='ready'||!Array.isArray(data.events)||data.events.length>250||data.timeZone!==range.timeZone)throw Error('Calendar timezone could not be verified.');}
  const incoming=data.events.map(e=>verifyEvent(e));const merged=new Map([...events,...incoming].map(e=>[e.id,e]));if(merged.size>250)throw Error('Calendar range is too large.');
  events=[...merged.values()];range={...range,timeZone:data.timeZone};status.timeZone=data.timeZone;hasMore=data.hasMore;capped=data.capped;nextCursor=typeof data.nextCursor==='string'?data.nextCursor:null;
 }catch(error){if(stamp===generation&&active()){events=[];notice=error.message||'Calendar could not load.';}}
 finally{if(stamp===generation&&onPage()){loading=false;renderView();if(queuedAction&&readEnabled()){const action=queuedAction;queuedAction=null;if(action.type==='event')void openEvent(action.id);if(action.type==='review')void showAssistantReview(action.draft);if(action.type==='issued')void showIssuedReview(action.receipt);}}}
}
function eventsOn(day){return events.filter(e=>{if(e.allDay)return day>=e.start&&day<e.end;const start=localDay(e.start),end=localDay(new Date(Date.parse(e.end)-1));return day>=start&&day<=end;}).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start.localeCompare(b.start));}
function color(event){let hash=0;for(const ch of event.id)hash=(hash*31+ch.charCodeAt(0))>>>0;return ['gold','blue','green','plum'][hash%4];}
function eventButton(e,extra=''){return '<button type="button" class="jc-event jc-'+color(e)+' '+extra+'" data-jc="event" data-id="'+esc(e.id)+'" aria-label="'+esc(e.title+'. '+when(e))+'"><span class="jc-event-time">'+esc(e.allDay?'All day':displayTime(e.start))+'</span><strong>'+esc(e.title||'Untitled appointment')+'</strong></button>';}
function monthHTML(){
 const days=windowDays(),now=today();return '<div class="jc-month" role="grid" aria-label="'+esc(dayLabel(anchor,{month:'long',year:'numeric'}))+'"><div class="jc-weekdays" role="row">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>'<span role="columnheader" aria-label="'+x+'">'+x+'</span>').join('')+'</div>'+Array.from({length:6},(_,week)=>'<div class="jc-month-week" role="row">'+days.slice(week*7,week*7+7).map(day=>{const items=eventsOn(day);return '<button type="button" role="gridcell" class="jc-day'+(day.slice(0,7)!==anchor.slice(0,7)?' jc-outside':'')+(day===selected?' jc-selected':'')+(day===now?' jc-today':'')+'" data-jc="day" data-day="'+day+'" tabindex="'+(day===selected?'0':'-1')+'" aria-selected="'+(day===selected)+'"'+(day===now?' aria-current="date"':'')+' aria-label="'+esc(dayLabel(day)+', '+items.length+' loaded appointment'+(items.length===1?'':'s'))+'"><span class="jc-date-number">'+Number(day.slice(8))+'</span><span class="jc-day-events">'+items.slice(0,2).map(e=>'<span class="jc-mini jc-'+color(e)+'">'+esc(e.title||'Untitled')+'</span>').join('')+(items.length>2?'<small>+'+(items.length-2)+' more</small>':'')+'</span></button>';}).join('')+'</div>').join('')+'</div>';
}
function layoutEvents(list,day){
 const timed=list.filter(e=>!e.allDay).map(e=>{const a=parts(e.start),b=parts(e.end);const start=localDay(e.start)<day?0:Number(a.hour)*60+Number(a.minute),end=localDay(e.end)>day?1440:Number(b.hour)*60+Number(b.minute);return {event:e,start,end:Math.max(start+42,end),lane:0,lanes:1};}).sort((a,b)=>a.start-b.start||b.end-a.end);
 let cluster=[],clusterEnd=-1;const finish=()=>{const lanes=Math.max(1,...cluster.map(x=>x.lane+1));cluster.forEach(x=>x.lanes=lanes);cluster=[];};
 for(const item of timed){if(item.start>=clusterEnd){finish();clusterEnd=-1;}let lane=0;while(cluster.some(x=>x.lane===lane&&x.end>item.start))lane++;item.lane=lane;cluster.push(item);clusterEnd=Math.max(clusterEnd,item.end);}finish();return timed;
}
function timeHTML(){
 const days=windowDays(),hours=Array.from({length:24},(_,i)=>i),now=today();
 return (view==='week'?'<p class="jc-week-hint">Swipe sideways to see the full week.</p>':'')+'<div class="jc-time-scroll" tabindex="0" aria-label="'+(view==='week'?'Week timeline; scroll horizontally for more days':'Day timeline')+'"><div class="jc-time-board jc-'+view+'-board" style="--jc-days:'+days.length+'"><div class="jc-time-heading"><span class="jc-zone-short">Time</span>'+days.map(d=>'<button type="button" class="'+(d===selected?'jc-selected':'')+'" data-jc="timeline-day" data-day="'+d+'"><span>'+dayLabel(d,{weekday:'short'})+'</span><strong'+(d===now?' class="jc-now"':'')+'>'+Number(d.slice(8))+'</strong></button>').join('')+'</div><div class="jc-all-day"><span>All day</span>'+days.map(d=>'<div>'+eventsOn(d).filter(e=>e.allDay).map(e=>eventButton(e,'jc-all-day-event')).join('')+'</div>').join('')+'</div><div class="jc-hours"><div class="jc-hour-rail">'+hours.map(h=>'<span style="top:'+(h*64)+'px">'+(h===0?'12 AM':h<12?h+' AM':h===12?'12 PM':h-12+' PM')+'</span>').join('')+'</div>'+days.map(d=>'<div class="jc-time-day" aria-label="'+esc(dayLabel(d))+'">'+hours.map(h=>'<button type="button" class="jc-time-slot" style="top:'+(h*64)+'px" data-jc="slot" data-day="'+d+'" data-hour="'+h+'" aria-label="'+esc(dayLabel(d)+' at '+String(h).padStart(2,'0')+':00')+'"></button>').join('')+layoutEvents(eventsOn(d),d).map(item=>'<div class="jc-positioned-event" style="top:'+(item.start/60*64)+'px;height:'+Math.max(44,(item.end-item.start)/60*64-3)+'px;left:'+(item.lane/item.lanes*100)+'%;width:'+(100/item.lanes)+'%">'+eventButton(item.event)+'</div>').join('')+'</div>').join('')+'</div></div></div>';
}
function agendaHTML(){
 const items=eventsOn(selected);
 return '<section class="jc-agenda" aria-label="Selected day"><div class="jc-agenda-heading"><div><span class="jc-kicker">YOUR DAY</span><h2>'+esc(dayLabel(selected))+'</h2></div><span class="jc-count">'+items.length+'</span></div>'+(items.length?'<div class="jc-agenda-list">'+items.map(e=>'<button type="button" class="jc-agenda-event jc-'+color(e)+'" data-jc="event" data-id="'+esc(e.id)+'"><span class="jc-agenda-time">'+esc(e.allDay?'All day':displayTime(e.start))+'</span><span><strong>'+esc(e.title||'Untitled appointment')+'</strong><small>'+esc(e.location||'Google Calendar')+'</small></span><span aria-hidden="true">›</span></button>').join('')+'</div>':'<div class="jc-empty-day">'+icon('calendar')+'<strong>'+(hasMore?'More appointments may be available.':'Room in your schedule.')+'</strong><p>'+(hasMore?'Load more before treating this day as empty.':'No appointments loaded for this day.')+'</p></div>')+'</section>';
}
function render(){
 return '<section id="job-calendar-root" class="job-calendar" aria-label="Calendar and jobs"></section>';
}
function renderView(){
 const node=root();if(!node||!active())return;
 const focused=document.activeElement?.dataset?.day,scroll=node.querySelector('.jc-time-scroll')?.scrollTop;
 const date=anchor||today();if(!anchor)anchor=date;if(!selected)selected=date;
 const accountLabel=status?.account?.email||'Your connected Google account';
 node.innerHTML='<header class="jc-header"><div><span class="jc-kicker">CALENDAR & JOBS</span><h1>Your working day.</h1><p>'+esc(accountLabel)+'</p></div><span class="jc-calendar-mark">'+icon('calendar')+'</span></header>'+
 (pending?'<div class="jc-notice jc-pending" role="status"><strong>A save needs checking.</strong><p>Check its result before creating another appointment.</p><button class="jc-button jc-dark" data-jc="operation">Check save status</button></div>':'')+
 '<div class="jc-toolbar"><div class="jc-date-nav"><button class="jc-icon-button" data-jc="prev" aria-label="Previous '+view+'">'+icon('left')+'</button><button class="jc-period" data-jc="today" aria-label="Return to today">'+esc(dayLabel(anchor,{month:'long',year:'numeric'}))+'</button><button class="jc-icon-button" data-jc="next" aria-label="Next '+view+'">'+icon('right')+'</button></div><div class="jc-toolbar-actions"><button class="jc-button" data-jc="today">Today</button><button class="jc-icon-button" data-jc="refresh" aria-label="Refresh calendar"'+(loading?' disabled':'')+'>'+icon('refresh')+'</button></div></div>'+
 '<div class="jc-ask-row"><button class="jc-button jc-ask" data-jc="ask">✦ Ask AI Assist</button></div><div class="jc-view-bar"><div class="jc-views" role="group" aria-label="Calendar view">'+['month','week','day'].map(v=>'<button data-jc="view" data-view="'+v+'" aria-pressed="'+(v===view)+'">'+v[0].toUpperCase()+v.slice(1)+'</button>').join('')+'</div><button class="jc-button jc-dark jc-add" data-jc="'+(canCreate()?'new':'manage')+'"'+(pending?' disabled':'')+'>'+icon('plus')+'<span>'+ (canCreate()?'Appointment':'Enable editing')+'</span></button></div>'+
 (notice?'<div class="jc-notice" role="status">'+esc(notice)+'</div>':'')+
 (!status&&loading?'<div class="jc-loading" role="status"><span></span>Opening your calendar…</div>':!readEnabled()?'<div class="jc-connection-empty">'+icon('calendar')+'<h2>Connect your working calendar.</h2><p>'+(status?.state==='setup_required'?'Your administrator must finish Google setup.':'Approve Calendar access to see your appointments and link job details.')+'</p><a class="jc-button jc-dark" href="#connections">Open Connected apps</a></div>':'<div class="jc-calendar-surface" aria-busy="'+loading+'">'+(loading?'<div class="jc-refreshing" role="status">Refreshing calendar…</div>':'')+(view==='month'?monthHTML():timeHTML())+'</div><div class="jc-calendar-footer"><span>'+esc(zone())+'</span><span>Google Calendar · Private</span></div>'+
 (hasMore||capped?'<div class="jc-more-events"><p>'+(capped?'This range is capped. Choose a smaller date range to see every appointment.':'More appointments are available in this range.')+'</p>'+(nextCursor&&!capped?'<button class="jc-button" data-jc="more"'+(loading?' disabled':'')+'>Load more appointments</button>':'')+'</div>':'')+
 agendaHTML());
 if(focused)node.querySelector('[data-jc="day"][data-day="'+focused+'"]')?.focus({preventScroll:true});
 if(node.querySelector('.jc-time-scroll'))node.querySelector('.jc-time-scroll').scrollTop=scroll===undefined?7*64:scroll;
}
function openManage(){closeDrawer(true);if(window.XtremeGoogleWorkspace?.openCalendarAccess)window.XtremeGoogleWorkspace.openCalendarAccess();else location.hash='#connections';}
function drawerElement(){return document.querySelector('#job-calendar-drawer');}
function ensureDrawer(){let d=drawerElement();if(!d){d=document.createElement('dialog');d.id='job-calendar-drawer';d.className='jc-drawer';d.setAttribute('aria-labelledby','jc-drawer-title');d.addEventListener('cancel',event=>{event.preventDefault();closeDrawer();});document.body.append(d);}return d;}
function closeDrawer(force=false){if(!force&&(drawer?.dirty||drawer?.jobDirty)&&!confirm('Discard your unsaved changes?'))return false;drawerGeneration++;for(const c of drawerControllers)c.abort();drawerControllers.clear();clearURLs();drawer=null;const d=drawerElement();if(d){d.close();d.remove();}return true;}
function snapshotCurrent(stamp,id){return onPage()&&drawerGeneration===stamp&&drawer?.eventId===id;}
async function openEvent(id){
 if(!onPage()||!readEnabled()||!/^[A-Za-z0-9_-]{1,256}$/.test(id)||!closeDrawer())return;
 drawer={eventId:id,tab:'details',loading:true,detail:null,job:null,error:'',busy:false,queue:[]};const stamp=drawerGeneration;drawDrawer();ensureDrawer().showModal();
 try{
  const [detail,job,jobs]=await Promise.all([request(API+'event',{body:{eventId:id},drawerBound:true}),request('/api/calendar/job?eventId='+encodeURIComponent(id),{drawerBound:true}),request('/api/work-hub?day='+today(),{drawerBound:true}).catch(()=>null)]);
  if(!snapshotCurrent(stamp,id))return;
  if(detail?.state!=='ready'||!detail.capabilities)throw Error('Appointment details could not be verified.');
  drawer.detail=verifyEvent(detail.event,true);drawer.capabilities=detail.capabilities;drawer.job=validateJob(job,id);drawer.jobDraft={...drawer.job.job};projects=Array.isArray(jobs?.jobs)?jobs.jobs:[];drawer.loading=false;drawDrawer();
 }catch(error){if(snapshotCurrent(stamp,id)){drawer.loading=false;drawer.error=error.message;drawDrawer();}}
}
function validateJob(data,id){
 if(!data||data.eventId!==id||typeof data.eventRef!=='string'||!Number.isSafeInteger(data.version)||data.version<0||!data.job||!Array.isArray(data.attachments)||data.attachments.length>10)throw Error('Private job details could not be verified.');
 if(drawer?.detail?.eventRef&&data.eventRef!==drawer.detail.eventRef)throw Error('This job does not match the appointment.');
 return data;
}
function safeGoogle(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['calendar.google.com','www.google.com'].includes(u.hostname)&&/^\/calendar(?:\/|$)/.test(u.pathname)?u.href:null;}catch{return null;}}
function safeDrive(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['drive.google.com','docs.google.com'].includes(u.hostname)?u.href:null;}catch{return null;}}
function createDraft(day=selected,hour=9){
 if(!canCreate()){openManage();return;}if(!closeDrawer())return;
 drawer={eventId:null,mode:'edit',tab:'details',dirty:false,busy:false,error:'',queue:[],draft:{title:'',notes:'',location:'',allDay:false,startDate:day,endDate:day,startTime:String(hour).padStart(2,'0')+':00',endTime:String(Math.min(hour+1,23)).padStart(2,'0')+':00',timeZone:zone()}};
 if(hour===23){drawer.draft.endDate=dayAdd(day,1);drawer.draft.endTime='00:00';}
 drawDrawer();ensureDrawer().showModal();
}
function editEvent(){if(!drawer?.detail?.editable||!drawer.capabilities?.manageOwn||pending)return;const e=drawer.detail,a=e.allDay?null:parts(e.start,e.timeZone),b=e.allDay?null:parts(e.end,e.timeZone);drawer.mode='edit';drawer.draft={title:e.title,notes:e.notes,location:e.location,allDay:e.allDay,startDate:e.allDay?e.start:localDay(e.start,e.timeZone),endDate:e.allDay?dayAdd(e.end,-1):localDay(e.end,e.timeZone),startTime:a?a.hour+':'+a.minute:'09:00',endTime:b?b.hour+':'+b.minute:'10:00',timeZone:e.timeZone};drawer.dirty=false;drawDrawer();}
function field(name,label,value,max,type='text',extra=''){return '<label class="jc-field"><span>'+label+'</span><input name="'+name+'" data-jc-field="'+name+'" type="'+type+'" maxlength="'+max+'" value="'+esc(value)+'" '+extra+'></label>';}
function editHTML(){
 const d=drawer.draft;return '<form id="jc-event-form"><div class="jc-editor-heading"><span class="jc-badge">Private appointment</span><p>'+esc(d.timeZone)+'</p></div>'+field('title','Appointment title',d.title,200,'text','required placeholder="Site visit, floor preparation…"')+'<label class="jc-checkbox"><input type="checkbox" data-jc-field="allDay"'+(d.allDay?' checked':'')+'>All day</label><div class="jc-field-pair">'+field('startDate','Start date',d.startDate,10,'date','required')+field('endDate',d.allDay?'Last day':'End date',d.endDate,10,'date','required')+'</div>'+(!d.allDay?'<div class="jc-field-pair">'+field('startTime','Start time',d.startTime,5,'time','required')+field('endTime','End time',d.endTime,5,'time','required')+'</div>':'')+field('location','Location',d.location,300,'text','placeholder="Jobsite address"')+'<label class="jc-field"><span>Appointment notes</span><textarea data-jc-field="notes" maxlength="4000" rows="4">'+esc(d.notes)+'</textarea></label><p class="jc-quiet">No guests, invitations or reminders. You will review before saving to Google.</p><button type="submit" class="jc-button jc-dark jc-wide"'+(drawer.busy?' disabled':'')+'>'+(drawer.busy?'Preparing review…':'Review appointment')+'</button></form>';
}
function reviewHTML(){const r=drawer.review;return '<section class="jc-review"><span class="jc-badge">Review before saving</span><h3>'+esc(r.draft.title)+'</h3><p>'+esc(when(r.draft))+'</p>'+(r.draft.location?'<p>'+icon('pin')+esc(r.draft.location)+'</p>':'')+(r.draft.notes?'<p class="jc-preserve">'+esc(r.draft.notes)+'</p>':'')+'<div class="jc-review-facts"><span>Google Calendar</span><strong>'+esc(status.account.email)+'</strong><span>Visibility</span><strong>Private</strong><span>Invitations & notifications</span><strong>None</strong><span>Reminders</span><strong>Off</strong></div><div class="jc-actions"><button class="jc-button" data-jc="back-edit"'+(drawer.busy||pending?' disabled':'')+'>Back</button><button class="jc-button jc-dark" data-jc="commit"'+(drawer.busy||pending?' disabled':'')+'>'+(drawer.busy?'Saving…':'Confirm & save')+'</button></div></section>';}
function jobHTML(){
 const e=drawer.detail,j=drawer.jobDraft||{},linked=projects.find(p=>p.id===j.jobId),url=safeGoogle(e.googleUrl);
 return '<section class="jc-event-overview"><span class="jc-badge">'+(e.editable?'Created in Xtreme Avatar':'Google appointment · read-only')+'</span><h3>'+esc(e.title)+'</h3><p class="jc-detail-when">'+icon('clock')+esc(when(e))+'</p>'+(e.location?'<p>'+icon('pin')+esc(e.location)+'</p>':'')+(e.notes?'<p class="jc-preserve">'+esc(e.notes)+'</p>':'')+'<div class="jc-actions">'+(e.editable&&drawer.capabilities?.manageOwn?'<button class="jc-button" data-jc="edit-event"'+(pending?' disabled':'')+'>Edit appointment</button>':'')+(url?'<a class="jc-button" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open in Google ↗</a>':'')+'</div></section><form id="jc-job-form" class="jc-job-form"><div class="jc-section-title"><h3>Job details</h3><span>Private to you</span></div><label class="jc-field"><span>Job folder</span><select data-jc-job="jobId"><option value="">Unlinked appointment</option>'+(j.jobId&&!linked?'<option value="'+esc(j.jobId)+'" selected>Unavailable folder — choose another or unlink</option>':'')+projects.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===j.jobId?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'+(drawer.job?.projectMissing?'<p class="jc-notice">The linked folder is no longer available. Your appointment notes and files remain private.</p>':'')+field('client','Customer',j.client||linked?.client||'',100).replace('data-jc-field','data-jc-job')+field('location','Jobsite address',j.location||linked?.location||'',160).replace('data-jc-field','data-jc-job')+'<label class="jc-field"><span>Job status</span><select data-jc-job="stage">'+Object.entries(stages).map(([key,label])=>'<option value="'+key+'"'+(j.stage===key?' selected':'')+'>'+label+'</option>').join('')+'</select></label><label class="jc-field"><span>Private job notes</span><textarea data-jc-job="notes" maxlength="4000" rows="4" placeholder="Surface preparation, color, crew, materials…">'+esc(j.notes||'')+'</textarea></label><button type="submit" class="jc-button jc-dark jc-wide"'+(drawer.busy||drawer.jobNeedsRefresh?' disabled':'')+'>'+(drawer.busy?'Saving…':'Save job details')+'</button><p class="jc-quiet">These details stay in Xtreme Avatar. They do not change the Google appointment.</p>'+(drawer.jobNeedsRefresh?'<button type="button" class="jc-button jc-wide" data-jc="files-refresh">Refresh job details</button>':'')+'</form>';
}
function fileHTML(){
 const list=drawer.job?.attachments?.filter(f=>f.status!=='deleted')||[],links=drawer.detail?.driveLinks||[];
 return '<section class="jc-files"><div class="jc-section-title"><h3>Photos & files</h3><span>Private app storage</span></div><p class="jc-quiet">JPEG, PNG, WebP or PDF · up to 4 MB each.</p>'+
 (drawer.job?.capabilities?.attachments!==true?'<p class="jc-notice">Private file storage needs administrator setup. Your job notes are still available.</p>':!drawer.job?.version?'<p class="jc-notice">Save job details first, then add files.</p>':'<label class="jc-upload-control">'+icon('plus')+'Choose a photo or document<input type="file" data-jc-file accept="image/jpeg,image/png,image/webp,application/pdf"'+(drawer.busy?' disabled':'')+'></label>')+
 (drawer.queue||[]).map((q,i)=>'<div class="jc-upload-row"><span>'+icon(q.file.type.startsWith('image/')?'photo':'file')+'</span><div><strong>'+esc(q.file.name)+'</strong><small>'+formatBytes(q.file.size)+' · '+esc(q.state)+'</small></div>'+(q.state==='Ready to upload'&&drawer.job?.capabilities?.attachments===true?'<button class="jc-button" data-jc="upload" data-index="'+i+'"'+(drawer.busy?' disabled':'')+'>Upload</button>':'')+'</div>').join('')+
 '<div class="jc-file-grid">'+list.map(f=>'<article class="jc-file-tile">'+(photos.has(f.id)?'<canvas data-jc-photo="'+esc(f.id)+'" role="img" aria-label="'+esc(f.fileName)+'"></canvas>':'<span class="jc-file-placeholder">'+icon(f.mimeType?.startsWith('image/')?'photo':'file')+'</span>')+'<div><strong>'+esc(f.fileName)+'</strong><small>'+formatBytes(f.byteSize)+' · '+esc(f.status==='ready'?'Saved':f.status)+'</small></div><div class="jc-file-actions">'+(f.status==='ready'&&drawer.job?.capabilities?.attachments===true?'<button class="jc-button" data-jc="file-open" data-id="'+esc(f.id)+'">'+(f.mimeType?.startsWith('image/')?'View photo':'Download PDF')+'</button>':'')+(drawer.job?.capabilities?.attachments===true?'<button class="jc-text-button" data-jc="file-remove-review" data-id="'+esc(f.id)+'">Remove</button>':'')+'</div></article>').join('')+'</div>'+
 (drawer.removeFile?'<div class="jc-notice"><strong>Remove '+esc(drawer.removeFile.fileName)+'?</strong><p>This removes the private app file. Google Drive files are not changed.</p><div class="jc-actions"><button class="jc-button" data-jc="file-remove-cancel">Keep file</button><button class="jc-button jc-danger" data-jc="file-remove-confirm">Remove file</button></div></div>':'')+
 '<button class="jc-button jc-wide" data-jc="files-refresh"'+(drawer.busy?' disabled':'')+'>Check files status</button>'+
 (links.length?'<div class="jc-drive-links"><h3>Google Drive links</h3><p class="jc-quiet">Stored in Google; separate from your private app uploads.</p>'+links.filter(l=>safeDrive(l.url)).map(l=>'<a href="'+esc(safeDrive(l.url))+'" target="_blank" rel="noopener noreferrer">'+icon('file')+esc(l.title||'Google Drive file')+' ↗</a>').join('')+'</div>':'')+'</section>';
}
function formatBytes(n){return n>=1000000?(n/1000000).toFixed(1)+' MB':Math.max(1,Math.round(n/1000))+' KB';}
function voiceControls(){const state=window.XtremeAssistantVoice?.getSessionState?.();return state?.active||state?.pending?'<div class="jc-voice-bar"><span>'+(state.active?'AI voice is '+(state.muted?'muted':'on'):'Microphone off · cleanup pending')+'</span><div>'+(state.active?'<button class="jc-button" data-jc="voice-mute">'+(state.muted?'Unmute':'Mute')+'</button>':'')+'<button class="jc-button" data-jc="voice-end">'+(state.active?'End voice':'Check voice cleanup')+'</button></div></div>':'';}
function drawDrawer(){
 if(!drawer||!onPage())return;const d=ensureDrawer(),activeElement=document.activeElement,key=activeElement?.dataset?.jcJob||activeElement?.dataset?.jcField,position=activeElement?.selectionStart,scroll=d.querySelector('.jc-drawer-body')?.scrollTop||0;
 d.innerHTML='<header class="jc-drawer-header"><div><span class="jc-kicker">'+(drawer.eventId?'APPOINTMENT & JOB':'NEW APPOINTMENT')+'</span><h2 id="jc-drawer-title">'+(drawer.mode==='review'?'Review your appointment':drawer.mode==='edit'?'Plan the work.':'Job workspace')+'</h2></div><button class="jc-icon-button" data-jc="close" aria-label="Close appointment">'+icon('close')+'</button></header>'+voiceControls()+'<div class="jc-drawer-body">'+(drawer.error?'<p class="jc-notice" role="status">'+esc(drawer.error)+'</p>':'')+(pending?'<button class="jc-button jc-dark jc-wide" data-jc="operation">Check save status</button>':'')+
 (drawer.loading?'<div class="jc-loading" role="status">Opening appointment…</div>':drawer.mode==='edit'?editHTML():drawer.mode==='review'?reviewHTML():!drawer.detail?'<button class="jc-button" data-jc="retry-detail">Try again</button>':'<div class="jc-tabs" role="group" aria-label="Appointment sections"><button data-jc="tab" data-tab="details" aria-pressed="'+(drawer.tab==='details')+'">Job details</button><button data-jc="tab" data-tab="files" aria-pressed="'+(drawer.tab==='files')+'">Photos & files <span>'+(drawer.job?.attachments?.filter(f=>f.status!=='deleted').length||0)+'</span></button></div>'+(drawer.tab==='files'?fileHTML():jobHTML()))+'</div>';
 for(const canvas of d.querySelectorAll('[data-jc-photo]')){const photo=photos.get(canvas.dataset.jcPhoto);if(photo){canvas.width=photo.width;canvas.height=photo.height;canvas.getContext('2d')?.drawImage(photo,0,0);}}
 const body=d.querySelector('.jc-drawer-body');if(body)body.scrollTop=scroll;
 if(key){const input=d.querySelector('[data-jc-job="'+key+'"],[data-jc-field="'+key+'"]');input?.focus({preventScroll:true});try{if(typeof position==='number')input?.setSelectionRange(position,position);}catch{}}
}
function recoverOperation(error){if(error?.recoveryRequestId&&Number.isSafeInteger(status?.revision)){try{savePending({ownerId:owner,requestId:error.recoveryRequestId,connectionRevision:status.revision});}catch{}renderView();}}
async function prepare(){
 if(!drawer?.draft||drawer.busy||pending)return;drawer.busy=true;drawer.error='';const stamp=drawerGeneration;
 try{
  const d=drawer.draft,draft={title:d.title.trim(),notes:d.notes,location:d.location,allDay:d.allDay,timeZone:d.timeZone,start:d.allDay?d.startDate:localInstant(d.startDate,d.startTime,d.timeZone),end:d.allDay?dayAdd(d.endDate,1):localInstant(d.endDate,d.endTime,d.timeZone)};
  if(!draft.title||draft.title.length>200||(draft.allDay?draft.end<=draft.start:Date.parse(draft.end)<=Date.parse(draft.start)))throw Error('Add a title and choose an end after the start.');
  const requestId=drawer.requestId||crypto.randomUUID();drawer.requestId=requestId;drawDrawer();
  const result=await request(API+'prepare',{drawerBound:true,body:{requestId,action:drawer.eventId?'update':'create',...(drawer.eventId?{eventId:drawer.eventId,etag:drawer.detail.etag}:{}),draft}});
  if(stamp!==drawerGeneration||!drawer)return;
  if(!reviewShape(result)||result.requestId!==requestId)throw Error('The private save review could not be verified.');
  drawer.review=result;drawer.mode='review';drawer.dirty=true;
 }catch(error){recoverOperation(error);if(stamp===drawerGeneration&&drawer)drawer.error=error.message;}
 finally{if(stamp===drawerGeneration&&drawer){drawer.busy=false;drawDrawer();}}
}
async function commit(){
 if(!drawer?.review||drawer.busy||pending)return;const review=drawer.review,stamp=drawerGeneration;
 try{savePending({ownerId:owner,requestId:review.requestId,connectionRevision:status.revision});}catch{drawer.error='This browser cannot preserve save recovery. Allow session storage before saving.';drawDrawer();return;}
 drawer.busy=true;drawer.error='';drawDrawer();renderView();
 try{
  const result=await request(API+'commit',{drawerBound:true,body:{requestId:review.requestId,reviewToken:review.reviewToken,confirm:true}});
  if(result?.state!=='completed'||result.requestId!==review.requestId||!isCompletedOperation(result))throw Error('The save has not been confirmed.');
  savePending(null);if(stamp===drawerGeneration&&drawer){drawer.dirty=false;closeDrawer(true);}anchor=review.draft.allDay?review.draft.start:localDay(review.draft.start,review.draft.timeZone);selected=anchor;await loadCalendar();notice='Appointment saved to Google Calendar.';renderView();
 }catch(error){recoverOperation(error);if(error.terminal===true&&error.requestId===review.requestId&&!error.recoveryRequestId)savePending(null);if(stamp===drawerGeneration&&drawer){drawer.error=pending?'Save not confirmed. Use Check save status; do not save again.':error.message;drawer.busy=false;drawDrawer();}renderView();}
}
function isCompletedOperation(result){return typeof result.eventId==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(result.eventId)&&typeof result.eventRef==='string'&&/^ce1_[a-f0-9]{64}$/.test(result.eventRef)&&typeof result.etag==='string';}
async function checkOperation(){
 if(!pending||!onPage())return;const id=pending.requestId;notice='Checking the previous save…';renderView();
 try{
  const checked=verifyStatus(await request('/api/connections/google/status',{revision:null}));if(checked.state!=='connected')throw Error('Reconnect the Google account used for this save, then check its status.');if(status?.revision!==checked.revision){events=[];range=null;closeDrawer(true);}status=checked;
  const result=await request(API+'operation',{body:{requestId:id,reconcile:true},revision:checked.revision});
  if(!pending||pending.requestId!==id)return;
  if(result.state==='completed'&&result.requestId===id&&isCompletedOperation(result)){savePending(null);if(drawer){drawer.dirty=false;closeDrawer(true);}await loadCalendar();notice='Your appointment was saved.';renderView();}
  else if(result.requestId===id&&result.terminal===true&&!/not_found|notfound/.test(result.code||'')){savePending(null);notice='The prior save did not finish. You can review a new save.';if(drawer){drawer.busy=false;drawer.mode='edit';drawer.review=null;drawer.requestId=null;drawer.error=notice;drawDrawer();}}
  else notice='The save is still '+(result.state==='pending'?'pending':'unconfirmed')+'. Check again before creating another appointment.';
 }catch(error){notice=/not_found|notfound/.test(error.code||'')?'Reconnect the Google account used for this save, then check its status. The recovery ID is kept.':error.message||'Save status could not be checked. Your pending save is still protected.';}
 renderView();
}
async function saveJob(){
 if(!drawer?.job||drawer.busy||drawer.jobNeedsRefresh)return;drawer.busy=true;drawer.error='';const stamp=drawerGeneration,id=drawer.eventId;drawDrawer();
 try{const result=await request('/api/calendar/job',{drawerBound:true,body:{eventId:id,version:drawer.job.version,data:drawer.jobDraft}});if(!snapshotCurrent(stamp,id))return;if(result.saved!==true||!Number.isSafeInteger(result.version))throw Error('Job save was not confirmed.');drawer.job.version=result.version;drawer.job.job={...drawer.jobDraft};drawer.jobDirty=false;drawer.jobNeedsRefresh=false;drawer.error='Job details saved privately.';}
 catch(error){if(snapshotCurrent(stamp,id)){drawer.jobNeedsRefresh=true;drawer.error=error.message+' Refresh job details before retrying.';}}
 finally{if(snapshotCurrent(stamp,id)){drawer.busy=false;drawDrawer();}}
}
async function refreshFiles(){if(!drawer?.eventId||drawer.busy)return;const stamp=drawerGeneration,id=drawer.eventId;drawer.busy=true;drawDrawer();try{const data=await request('/api/calendar/job?eventId='+encodeURIComponent(id),{drawerBound:true});if(snapshotCurrent(stamp,id)){drawer.job=validateJob(data,id);if(!drawer.jobDirty)drawer.jobDraft={...data.job};drawer.jobNeedsRefresh=false;drawer.error='Saved job and file status checked.';}}catch(error){if(snapshotCurrent(stamp,id))drawer.error=error.message;}finally{if(snapshotCurrent(stamp,id)){drawer.busy=false;drawDrawer();}}}
async function upload(index){
 const item=drawer?.queue?.[index];if(!item||item.state!=='Ready to upload'||drawer.busy||!drawer.job?.version||drawer.job.capabilities?.attachments!==true)return;const stamp=drawerGeneration,id=drawer.eventId;drawer.busy=true;item.state='Reserving…';drawDrawer();
 try{
  const reserved=await request('/api/calendar/job-files/reserve',{drawerBound:true,body:{eventId:id,jobVersion:drawer.job.version,requestId:item.requestId,fileName:item.file.name,mimeType:item.file.type,byteSize:item.file.size}});
  if(!snapshotCurrent(stamp,id))return;
  if(!reserved.attachment?.id)throw Error('File reservation was not confirmed.');item.state='Uploading…';item.attachmentId=reserved.attachment.id;drawDrawer();
  const result=await request('/api/calendar/job-files/upload?eventId='+encodeURIComponent(id)+'&attachmentId='+encodeURIComponent(item.attachmentId),{body:item.file,raw:true,drawerBound:true});
  if(!snapshotCurrent(stamp,id))return;if(result.attachment?.status!=='ready')throw Error('Upload was not confirmed.');
  drawer.queue.splice(index,1);drawer.job.attachments=drawer.job.attachments.filter(f=>f.id!==result.attachment.id).concat(result.attachment);drawer.error='';
 }catch(error){if(snapshotCurrent(stamp,id)){item.state='Not confirmed — check files status';drawer.error=error.message;}}
 finally{if(snapshotCurrent(stamp,id)){drawer.busy=false;drawDrawer();}}
}
async function imageDimensions(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);let width=0,height=0;
 if(blob.type==='image/png'&&bytes.length>=24&&view.getUint32(0)===0x89504e47&&view.getUint32(4)===0x0d0a1a0a){width=view.getUint32(16);height=view.getUint32(20);}
 else if(blob.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){let i=2;while(i+8<bytes.length){if(bytes[i++]!==255)continue;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===217||marker===218)break;if(marker===216||marker===1||(marker>=208&&marker<=215))continue;const size=view.getUint16(i);if(size<2||i+size>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=7){height=view.getUint16(i+3);width=view.getUint16(i+5);break;}i+=size;}}
 else if(blob.type==='image/webp'&&bytes.length>=30&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'){const tag=String.fromCharCode(...bytes.slice(12,16));if(tag==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}else if(tag==='VP8L'&&bytes[20]===47){const bits=view.getUint32(21,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;}else if(tag==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;}}
 if(width<1||height<1||width>8192||height>8192||width*height>16000000)throw Error('This image exceeds the safe preview limits. Download or choose a smaller image.');
 return {width,height};
}
async function openFile(id){
 const file=drawer?.job?.attachments.find(f=>f.id===id&&f.status==='ready');if(!file||drawer.busy||drawer.job?.capabilities?.attachments!==true)return;const stamp=drawerGeneration,eventId=drawer.eventId;drawer.busy=true;drawDrawer();
 try{
  const blob=await request('/api/calendar/job-files/content?eventId='+encodeURIComponent(eventId)+'&attachmentId='+encodeURIComponent(id),{blob:true,drawerBound:true});
  if(!snapshotCurrent(stamp,eventId))return;if(blob.size!==file.byteSize||blob.type!==file.mimeType||blob.size>4000000||!['image/jpeg','image/png','image/webp','application/pdf'].includes(blob.type))throw Error('The file could not be verified.');
  if(file.mimeType.startsWith('image/')){
   const dimensions=await imageDimensions(blob);if(!snapshotCurrent(stamp,eventId))return;
   const scale=Math.min(1,800/dimensions.width,800/dimensions.height);
   const bitmap=await createImageBitmap(blob,{resizeWidth:Math.max(1,Math.round(dimensions.width*scale)),resizeHeight:Math.max(1,Math.round(dimensions.height*scale)),resizeQuality:'high'});
   if(!snapshotCurrent(stamp,eventId)){bitmap.close();return;}
   for(const photo of photos.values())photo.close();photos.clear();photos.set(file.id,bitmap);
  }else if(file.mimeType==='application/pdf'){const url=URL.createObjectURL(blob);urls.add(url);const link=document.createElement('a');link.href=url;link.download='job-file.pdf';document.body.append(link);link.click();link.remove();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);}
  else throw Error('The file format did not match.');
 }catch(error){if(snapshotCurrent(stamp,eventId))drawer.error=error.message;}
 finally{if(snapshotCurrent(stamp,eventId)){drawer.busy=false;drawDrawer();}}
}
async function removeFile(){
 const file=drawer?.removeFile;if(!file||drawer.busy||drawer.job?.capabilities?.attachments!==true)return;const stamp=drawerGeneration,id=drawer.eventId;drawer.busy=true;drawDrawer();
 try{const result=await request('/api/calendar/job-files/remove',{drawerBound:true,body:{eventId:id,attachmentId:file.id,version:file.version,confirm:true}});if(!snapshotCurrent(stamp,id))return;if(result.removed!==true)throw Error('Removal was not confirmed.');photos.get(file.id)?.close();photos.delete(file.id);drawer.job.attachments=drawer.job.attachments.filter(f=>f.id!==file.id);drawer.removeFile=null;drawer.error='File removed from private app storage.';}
 catch(error){if(snapshotCurrent(stamp,id))drawer.error=error.message;}
 finally{if(snapshotCurrent(stamp,id)){drawer.busy=false;drawDrawer();}}
}
async function navigateDate(action){
 if(loading||!closeDrawer())return;
 if(action==='today'){anchor=today();selected=anchor;}
 else if(view==='month'){const date=new Date(anchor.slice(0,7)+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+(action==='next'?1:-1));anchor=date.toISOString().slice(0,10);selected=anchor;}
 else{anchor=dayAdd(anchor,(action==='next'?1:-1)*(view==='week'?7:1));selected=anchor;}
 await loadCalendar();
}
document.addEventListener('click',event=>{
 const b=event.target.closest?.('[data-jc]');if(!b||!onPage())return;event.preventDefault();const action=b.dataset.jc;
 if(['prev','next','today'].includes(action)){void navigateDate(action);return;}
 if(action==='view'&&['month','week','day'].includes(b.dataset.view)){if(loading||!closeDrawer())return;view=b.dataset.view;anchor=selected;void loadCalendar();return;}
 if(action==='day'){selected=b.dataset.day;renderView();return;}
 if(action==='timeline-day'){selected=b.dataset.day;renderView();return;}
 if(action==='event'){void openEvent(b.dataset.id);return;}
 if(action==='slot'){createDraft(b.dataset.day,Number(b.dataset.hour));return;}
 if(action==='voice-mute'){window.XtremeAssistantVoice?.toggleMute?.();return;}if(action==='voice-end'){window.XtremeAssistantVoice?.stop?.();return;}
 if(action==='ask'){window.dispatchEvent(new CustomEvent('xtreme:assistant-prompt',{detail:{prompt:'Help me manage my calendar for '+selected+' ('+zone()+'). Review any proposed appointment changes with me before saving.'}}));return;}
 if(action==='new'){createDraft();return;}if(action==='manage'){openManage();return;}
 if(action==='refresh'){void loadCalendar();return;}if(action==='more'&&nextCursor){void loadCalendar(true);return;}
 if(action==='close'){closeDrawer();return;}if(action==='operation'){void checkOperation();return;}
 if(action==='edit-event'){editEvent();return;}if(action==='back-edit'&&drawer&&!drawer.busy){drawer.mode='edit';drawDrawer();return;}
 if(action==='commit'){void commit();return;}if(action==='retry-detail'&&drawer?.eventId){void openEvent(drawer.eventId);return;}
 if(action==='tab'&&drawer&&!drawer.busy){drawer.tab=b.dataset.tab==='files'?'files':'details';drawDrawer();return;}
 if(action==='files-refresh'){void refreshFiles();return;}if(action==='upload'){void upload(Number(b.dataset.index));return;}
 if(action==='file-open'){void openFile(b.dataset.id);return;}if(action==='file-remove-review'&&drawer&&!drawer.busy){drawer.removeFile=drawer.job?.attachments.find(f=>f.id===b.dataset.id)||null;drawDrawer();return;}
 if(action==='file-remove-cancel'&&drawer){drawer.removeFile=null;drawDrawer();return;}if(action==='file-remove-confirm'){void removeFile();}
});
document.addEventListener('keydown',event=>{
 const cell=event.target.closest?.('[data-jc="day"]');if(!cell||!onPage())return;const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-new Date(selected+'T12:00:00Z').getUTCDay(),End:6-new Date(selected+'T12:00:00Z').getUTCDay()}[event.key];
 if(delta!==undefined){event.preventDefault();selected=dayAdd(selected,delta);if(windowDays().includes(selected)){renderView();root()?.querySelector('[data-jc="day"][data-day="'+selected+'"]')?.focus();}else{anchor=selected;void loadCalendar();}}
 if(['PageUp','PageDown'].includes(event.key)){event.preventDefault();void navigateDate(event.key==='PageDown'?'next':'prev');}
});
function editInput(event){
 if(!drawer||drawer.busy)return;const target=event.target,field=target.dataset?.jcField,job=target.dataset?.jcJob;
 if(field&&drawer.draft&&Object.hasOwn(drawer.draft,field)){drawer.draft[field]=field==='allDay'?target.checked:target.value;drawer.dirty=true;drawer.requestId=null;if(field==='allDay')drawDrawer();}
 if(job&&drawer.jobDraft&&Object.hasOwn(drawer.jobDraft,job)){drawer.jobDraft[job]=job==='jobId'?(target.value||null):target.value;drawer.jobDirty=true;}
}
document.addEventListener('input',editInput);document.addEventListener('change',event=>{editInput(event);if(!event.target.matches?.('[data-jc-file]')||!drawer||drawer.busy)return;const file=event.target.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)||file.size<1||file.size>4000000||file.name.length>160){drawer.error='Choose a JPEG, PNG, WebP or PDF up to 4 MB with a filename under 160 characters.';}else{drawer.queue.push({file,requestId:crypto.randomUUID(),state:'Ready to upload'});drawer.error='';}drawDrawer();});
document.addEventListener('submit',event=>{if(event.target.id==='jc-event-form'){event.preventDefault();void prepare();}if(event.target.id==='jc-job-form'){event.preventDefault();void saveJob();}});
window.addEventListener('hashchange',()=>{if(location.hash!=='#calendar'){if(!allowNavigation&&(drawer?.dirty||drawer?.jobDirty)&&!confirm('Discard your unsaved calendar changes?')){location.hash='#calendar';return;}allowNavigation=false;leave();}});
window.addEventListener('xtreme:account-ended',()=>{ended=true;try{savePending(null);}catch{}clearPrivate();});
window.addEventListener('xtreme:voice-session-changed',()=>{if(drawer&&onPage())drawDrawer();});
window.addEventListener('beforeunload',event=>{if(active()&&(drawer?.dirty||drawer?.jobDirty||drawer?.busy||pending)){event.preventDefault();event.returnValue='';}});
function activate(){if(!onPage())return;document.querySelector('.app-shell')?.classList.add('job-calendar-mode');renderView();if(!range&&!loading)void loadCalendar();}
function confirmLeave(){if((drawer?.dirty||drawer?.jobDirty)&&!confirm('Discard your unsaved calendar changes?'))return false;allowNavigation=true;return true;}
function openDate(day,nextView='month'){if(!active()||!dateOK(day)||!['month','week','day'].includes(nextView)||!closeDrawer())return false;anchor=day;selected=day;view=nextView;if(location.hash!=='#calendar')location.hash='#calendar';else void loadCalendar();return true;}
function openAppointment(eventId){if(!active()||typeof eventId!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(eventId))return false;if(onPage()&&readEnabled()){void openEvent(eventId);return true;}queuedAction={type:'event',id:eventId};location.hash='#calendar';return true;}
async function showAssistantReview(draft){
 if(!canCreate()||pending){notice='Enable Calendar editing before reviewing a new appointment.';renderView();return false;}
 createDraft(draft.allDay?draft.start:localDay(draft.start,draft.timeZone));
 if(!drawer)return false;const a=draft.allDay?null:parts(draft.start,draft.timeZone),b=draft.allDay?null:parts(draft.end,draft.timeZone);
 drawer.draft={title:draft.title,notes:draft.notes,location:draft.location,allDay:draft.allDay,timeZone:draft.timeZone,startDate:draft.allDay?draft.start:localDay(draft.start,draft.timeZone),endDate:draft.allDay?dayAdd(draft.end,-1):localDay(draft.end,draft.timeZone),startTime:a?a.hour+':'+a.minute:'09:00',endTime:b?b.hour+':'+b.minute:'10:00'};drawer.dirty=true;drawDrawer();await prepare();return true;
}
function reviewDraft(input){
 if(!active()||!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>200||typeof input.notes!=='string'||input.notes.length>4000||typeof input.location!=='string'||input.location.length>300||typeof input.allDay!=='boolean'||typeof input.timeZone!=='string')return false;
 try{new Intl.DateTimeFormat(undefined,{timeZone:input.timeZone}).format(0);if(input.allDay?(!dateOK(input.start)||!dateOK(input.end)||input.end<=input.start):(!Number.isFinite(Date.parse(input.start))||!Number.isFinite(Date.parse(input.end))||Date.parse(input.end)<=Date.parse(input.start)))return false;}catch{return false;}
 const draft={title:input.title,notes:input.notes,location:input.location,allDay:input.allDay,timeZone:input.timeZone,start:input.start,end:input.end};
 if(onPage()&&readEnabled())void showAssistantReview(draft);else{queuedAction={type:'review',draft};location.hash='#calendar';}return true;
}
function reviewShape(value){
 if(!value||value.state!=='review'||!['create','update'].includes(value.action)||typeof value.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.requestId)||typeof value.reviewToken!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(value.reviewToken)||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now()||value.defaults?.visibility!=='private'||value.defaults?.notifications!==false||value.defaults?.reminders!==false)return false;
 const d=value.draft;if(!d||typeof d.title!=='string'||!d.title.trim()||d.title.length>200||typeof d.notes!=='string'||d.notes.length>4000||typeof d.location!=='string'||d.location.length>300||typeof d.allDay!=='boolean'||typeof d.timeZone!=='string')return false;
 try{new Intl.DateTimeFormat(undefined,{timeZone:d.timeZone}).format(0);if(d.allDay?(!dateOK(d.start)||!dateOK(d.end)||d.end<=d.start):(!Number.isFinite(Date.parse(d.start))||!Number.isFinite(Date.parse(d.end))||Date.parse(d.end)<=Date.parse(d.start)))return false;}catch{return false;}
 return value.action==='create'?(value.eventId===null&&value.eventRef===null):typeof value.eventId==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value.eventId)&&typeof value.eventRef==='string'&&/^ce1_[a-f0-9]{64}$/.test(value.eventRef);
}
async function showIssuedReview(receipt){
 if(!onPage()||pending||!reviewShape(receipt.review)||receipt.connectionRevision!==status?.revision)return false;
 const review=receipt.review;if(review.action==='create'?!canCreate():!status?.calendarCapabilities?.manageOwn)return false;
 if(!closeDrawer())return false;
 const draft=review.draft,a=draft.allDay?null:parts(draft.start,draft.timeZone),b=draft.allDay?null:parts(draft.end,draft.timeZone);
 drawer={eventId:review.eventId,mode:'review',tab:'details',dirty:true,busy:false,error:'',queue:[],review,requestId:review.requestId,draft:{...draft,startDate:draft.allDay?draft.start:localDay(draft.start,draft.timeZone),endDate:draft.allDay?dayAdd(draft.end,-1):localDay(draft.end,draft.timeZone),startTime:a?a.hour+':'+a.minute:'09:00',endTime:b?b.hour+':'+b.minute:'10:00'}};
 const stamp=drawerGeneration;drawDrawer();ensureDrawer().showModal();
 if(review.action==='update'){drawer.busy=true;drawDrawer();try{const detail=await request(API+'event',{body:{eventId:review.eventId},drawerBound:true});if(stamp!==drawerGeneration)return false;const event=verifyEvent(detail.event,true);if(event.eventRef!==review.eventRef||!event.editable||!detail.capabilities?.manageOwn)throw Error('This appointment is no longer editable.');drawer.detail=event;drawer.capabilities=detail.capabilities;}catch(error){if(stamp===drawerGeneration&&drawer){drawer.review=null;drawer.mode='blocked';drawer.error=error.message;drawDrawer();}return false;}finally{if(stamp===drawerGeneration&&drawer){drawer.busy=false;drawDrawer();}}}
 return true;
}
async function showPreparedReview(receipt){
 if(!active()||pending||!receipt||!Number.isSafeInteger(receipt.connectionRevision)||receipt.connectionRevision<1||!reviewShape(receipt.review))return false;
 try{const checked=verifyStatus(await request('/api/connections/google/status',{revision:null}));if(checked.revision!==receipt.connectionRevision||checked.state!=='connected'||checked.calendarAccess!=='manage')return false;if(!active())return false;status=checked;const d=receipt.review.draft;anchor=d.allDay?d.start:localDay(d.start,d.timeZone);selected=anchor;status.timeZone=d.timeZone;view='day';
  if(onPage()){await loadCalendar();return showIssuedReview(receipt);}queuedAction={type:'issued',receipt};location.hash='#calendar';return true;
 }catch{return false;}
}
window.XtremeJobCalendar=Object.freeze({render,activate,deactivate:leave,openDate,openAppointment,reviewDraft,showPreparedReview,confirmLeave,hasUnsaved:()=>Boolean(active()&&(drawer?.dirty||drawer?.jobDirty||drawer?.busy||pending))});
window.dispatchEvent(new Event('xtreme:job-calendar-ready'));
})();

/* Connected apps: account-owned linking and an honest catalogue of other tools. */
(() => {
  'use strict';
  const account = window.XtremeAccount, owner = account?.user?.id;
  const DESK_ORIGIN = 'https://eden-skye-call-desk.strategic-ai.chatgpt.site';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
  const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg>';
  const apps = [
    { id:'call-desk', name:'Call Desk', mark:'∞', category:'assistant', label:'Profile & memory', copy:'Link your own Call Desk account to your assistant.', permissions:['Link only the Call Desk account you sign in to and approve.','Share only the profile and memory information covered by that approval.','Disconnect this link without deleting your Call Desk account.'], kind:'link' },
    { id:'google-workspace', name:'Google Workspace', mark:'G', category:'google', label:'Your Google services', copy:'Connect Gmail, Calendar, Drive, Docs, Sheets, Slides, Contacts and Tasks with your own Google account.', permissions:[], kind:'google', included:['Gmail','Calendar','Drive','Docs','Sheets','Slides','Contacts','Tasks'] },
    { id:'gmail', name:'Gmail', mark:'M', category:'google', label:'Email', copy:'Bring email threads and follow-ups into your workday.', permissions:['Read and organize messages in the Google account you authorize.','Draft and send email only when you explicitly ask for the outbound action.','Mailbox settings, forwarding, and delegation remain separate security-sensitive controls.'], kind:'google', url:'https://mail.google.com/', included:[] },
    { id:'calendar', name:'Google Calendar', mark:'31', category:'google', label:'Schedule', copy:'Availability, appointments, and meetings in one place.', permissions:['Read calendars you authorize.','Create and update events with a visible review before the save.','Meet links belong to Calendar events; this does not join or record calls.'], kind:'google', url:'https://calendar.google.com/', included:['Meet links'] },
    { id:'drive', name:'Google Drive', mark:'D', category:'google', label:'Files & documents', copy:'Plans, specifications, proposals, and project files.', permissions:['Read and edit files your Google account can access.','Create and organize Drive files plus Docs, Sheets, and Slides.','Sharing or destructive actions are used only when you explicitly ask.'], kind:'google', url:'https://drive.google.com/', included:['Docs','Sheets','Slides'] },
    { id:'contacts', name:'Google Contacts', mark:'C', category:'google', label:'People', copy:'Find the right client, supplier, or crew member.', permissions:['Planned: search contacts you authorize.','Reading a contact never authorizes a call or message.'], kind:'google', url:'https://contacts.google.com/', included:[] },
    { id:'gpt-voice', name:'GPT live voice', mark:'◖◗', category:'assistant', label:'AI conversation', copy:'Talk to the existing AI voice assistant in this app.', permissions:['Microphone access starts when you choose to begin a voice session.','Uses the app’s configured service and usage limits. This is not a personal OpenAI account connection.'], kind:'tool', status:'Available in app', route:'voice', action:'Open Voice' },
    { id:'tavus', name:'Tavus video', mark:'V', category:'assistant', label:'Video assistant', copy:'Open the existing company avatar face to face.', permissions:['Camera and microphone permissions are requested by the video experience when needed.','Uses the existing company deployment. This does not connect a personal Tavus account or create a new avatar.'], kind:'tool', status:'Available in app', action:'Open Video', video:true },
    { id:'twilio', name:'Twilio calling', mark:'T', category:'assistant', label:'Phone calls', copy:'Review a call through the existing Call Desk.', permissions:['Calling uses the app’s configured line and is limited to eligible owners.','Recipient, purpose, and call approval are required before dialing.','A personal Twilio account connection and AI three-way calls are not enabled here.'], kind:'tool', status:'Owner calling', route:'calls', action:'Open Call Desk' },
    { id:'auto-leads', name:'XPS Auto Leads', mark:'X', category:'business', label:'Construction leads', copy:'Discover projects in the existing leads workspace.', permissions:['Opens the existing Auto Leads tool with its own authorized sign-in.','This app does not receive that account’s credentials or automatically begin outreach.'], kind:'tool', status:'Separate sign-in', route:'leads', action:'Open Auto Leads' },
    { id:'etherverse', name:'Etherverse', mark:'∞', category:'business', label:'Agent team', copy:'The agent workspace for approved tasks and returned work.', permissions:['A registered agent is not proof that it is available or has accepted a task.','Visitor task routing, account permissions, and completion receipts must be verified before jobs can be dispatched.','Personal memories, Google accounts, and private job data are not shared with agents by opening this workspace.'], kind:'setup' },
    { id:'infinity', name:'XPS Infinity Loop', mark:'∞', category:'business', label:'Business workflows', copy:'A future connection for approved business workflows.', permissions:['Visitor workflow access and permission limits must be configured and verified first.','No background jobs or business-system actions start from this screen.'], kind:'setup' },
  ];
  let ended = false, epoch = 0, query = '', category = 'all', selected = null, opener = null;
  let desk = { status:'unknown', linked:false }, checking = false, busy = null, checked = false;
  let notice = '', uncertain = false, disconnectReview = false, consentUrl = '';
  const controllers = new Set();

  const googleServices = [
    {id:'gmail',name:'Gmail',copy:'Permission to read, compose, send, and permanently delete mail.'},
    {id:'calendar',name:'Calendar',copy:'Permission to view, edit, share, and delete calendars you can access.'},
    {id:'drive',name:'Drive',copy:'Permission to view, create, edit, and delete Drive files.'},
    {id:'docs',name:'Docs',copy:'Permission to view, create, edit, and delete Google Docs.'},
    {id:'sheets',name:'Sheets',copy:'Permission to view, create, edit, and delete spreadsheets.'},
    {id:'slides',name:'Slides',copy:'Permission to view, create, edit, and delete presentations.'},
    {id:'contacts',name:'Contacts',copy:'Permission to view, download, edit, and delete contacts.'},
    {id:'tasks',name:'Tasks',copy:'Permission to create, organize, update, and delete tasks.'},
  ];
  const googleIds = new Set(googleServices.map(service => service.id));
  let googleState = {state:'unavailable',configured:false,account:null,revision:null,services:[],hasSavedConnection:false};
  let googleChecked = false, googleChecking = false, googleBusy = null, googleNotice = '', googleReview = false, googleUncertain = false, googleConsentUrl = '';
  let googleSelection = new Set(), googleSelectionEdited = false, googleReturn = '', googleManageRequested = false;
  try {
    const result = new URLSearchParams(location.search || '').get('google');
    if (result) {
      googleReturn = ['connected','cancelled','error','reconnect'].includes(result) ? result : 'error';
      googleNotice = result === 'connected' ? 'Checking your Google connection…' : result === 'cancelled' ? 'Google approval was cancelled. Your current access will be checked.' : 'Google approval did not finish. Check your connection before trying again.';
      if (window.history?.replaceState) { const url = new URL(location.href); url.searchParams.delete('google'); window.history.replaceState(null,'',url.pathname+url.search+url.hash); }
    }
  } catch { /* Callback text never supplies trusted connection status. */ }
  function googleConnected() { return googleChecked && !googleChecking && googleState.state === 'connected'; }
  function googleStatus(serviceId) {
    if (googleChecking) return 'Checking…';
    if (!googleChecked) return 'Not checked';
    if (googleState.state === 'setup_required') return 'Setup required';
    if (googleState.state === 'unavailable') return 'Check unavailable';
    if (googleState.state === 'reconnect_required') return 'Reconnect required';
    if (googleState.state === 'disconnected') return 'Not connected';
    if (!serviceId || serviceId === 'google-workspace') return 'Connected';
    const service = googleState.services.find(item => item.id === serviceId);
    return service?.authorized && service.enabled ? 'Read & write' : service?.authorized ? 'Reconnect for full access' : 'Needs permission';
  }
  const calendarMessages = Object.freeze({
    calendar_disabled:'Calendar appointments are not enabled for this app yet. Ask your administrator to finish setup.',
    calendar_api_disabled:'The Google Calendar API is not enabled for this app. Ask your administrator to enable it; reconnecting will not fix this.',
    google_connection_required:'Connect your Google account before viewing appointments.',
    calendar_scope_required:'Calendar read permission is missing. Update Google access and approve Calendar.',
    connection_changed:'Your Google connection changed. Check Google status, then view appointments again.',
    connection_revision_required:'Check Google status, then view appointments again.',
    calendar_rate_limited:'Google Calendar has temporarily limited requests. Wait a moment, then refresh appointments.',
    calendar_reconnect_required:'Google needs you to reconnect your account. Check Google status, then reconnect.',
    reconnect_required:'Google needs you to reconnect your account. Check Google status, then reconnect.',
    calendar_unavailable:'Google Calendar is temporarily unavailable. Try again later.',
    calendar_response_invalid:'Appointments could not be verified. Try again later.',
    calendar_timeout:'Loading appointments took too long. Try again later.',
    setup_required:'Google Calendar setup is incomplete. Ask your administrator to finish setup.',
    identity_service_unavailable:'Your Google connection could not be verified right now. Try again later.',
    connection_configuration_changed:'Google connection setup changed. Check Google status before continuing.',
    refresh_pending:'Your Google connection is updating. Wait a moment, then check Google status.',
    refresh_unconfirmed:'Your Google connection refresh could not be confirmed. Check Google status before continuing.',
  });
  let calendarGeneration=0, calendarController=null, calendarOpened=false, calendarLoading=false, calendarResult=null, calendarError='';
  function calendarAvailable() {
    return active() && googleConnected() && !googleBusy && !googleReview && !googleUncertain && Number.isSafeInteger(googleState.revision) && googleState.revision>0 && googleState.services.some(service=>service.id==='calendar'&&service.authorized&&service.enabled);
  }
  function clearCalendar() {
    calendarGeneration++;calendarController?.abort();calendarController=null;
    calendarOpened=false;calendarLoading=false;calendarResult=null;calendarError='';
    dialog()?.querySelector('[data-gw-calendar-results]')?.replaceChildren?.();
  }
  function calendarActions() {
    if(!calendarAvailable())return '';
    return '<section class="ca-permissions"><h3>Your appointments</h3><a class="ca-secondary" href="#calendar" data-ca-launch>Open Calendar & jobs →</a><p class="ca-link-note">Read your primary calendar for the next 7 days. Appointments load only when you choose to view them.</p><button type="button" class="ca-primary" data-gw-calendar-read'+(calendarLoading?' disabled':'')+'>'+(calendarLoading?'Loading appointments…':calendarOpened?'Refresh appointments':'View upcoming appointments')+'</button>'+(calendarError?'<button type="button" class="ca-secondary" data-gw-refresh>Check Google status</button>':'')+'<div data-gw-calendar-results role="status" aria-live="polite" aria-atomic="true"></div></section>';
  }
  function validCalendarResult(data) {
    const fail=()=>{throw new Error('Calendar response could not be verified.');};
    const utc=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19);
    const dateOnly=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    if(!data||data.state!=='ready'||typeof data.timeZone!=='string'||data.timeZone.length>100||!utc(data.rangeStart)||!utc(data.rangeEnd)||Date.parse(data.rangeEnd)-Date.parse(data.rangeStart)!==7*86400000||!Array.isArray(data.events)||data.events.length>25||typeof data.hasMore!=='boolean')fail();
    try{new Intl.DateTimeFormat(undefined,{timeZone:data.timeZone}).format(0);}catch{fail();}
    const seen=new Set(), events=data.events.map(event=>{
      if(!event||typeof event.id!=='string'||!event.id||event.id.length>256||seen.has(event.id)||typeof event.title!=='string'||event.title.length>200||typeof event.location!=='string'||event.location.length>300||typeof event.allDay!=='boolean')fail();
      if(event.allDay?(!dateOnly(event.start)||!dateOnly(event.end)||event.end<=event.start):(!utc(event.start)||!utc(event.end)||Date.parse(event.end)<=Date.parse(event.start)))fail();
      seen.add(event.id);
      return {id:event.id,title:event.title,start:event.start,end:event.end,allDay:event.allDay,location:event.location};
    });
    return {timeZone:data.timeZone,rangeStart:data.rangeStart,rangeEnd:data.rangeEnd,events,hasMore:data.hasMore};
  }
  function calendarWhen(event,timeZone) {
    if(event.allDay){
      const format=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
      const first=format.format(new Date(event.start+'T00:00:00Z'));
      const last=format.format(new Date(Date.parse(event.end+'T00:00:00Z')-86400000));
      return 'All day · '+first+(first===last?'':' – '+last);
    }
    const format=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone,timeZoneName:'short'});
    return format.format(new Date(event.start))+' – '+format.format(new Date(event.end));
  }
  function renderCalendar() {
    if(!calendarOpened||!calendarAvailable())return;
    const host=dialog()?.querySelector('[data-gw-calendar-results]');if(!host)return;
    host.replaceChildren();
    const text=(tag,value,className)=>{const element=document.createElement(tag);element.textContent=value;if(className)element.className=className;return element;};
    if(calendarLoading){host.append(text('p','Loading appointments…','ca-link-note'));return;}
    if(calendarError){host.append(text('p',calendarError,'ca-link-note'));return;}
    if(!calendarResult)return;
    host.append(text('p','Next 7 days · Times shown in '+calendarResult.timeZone+'.','ca-link-note'));
    if(!calendarResult.events.length)host.append(text('p',calendarResult.hasMore?'No appointments on this page. More may be available in your calendar.':'No upcoming appointments in your primary calendar for the next 7 days.','ca-link-note'));
    else {
      const list=document.createElement('ul');
      for(const event of calendarResult.events){
        const item=document.createElement('li');item.append(text('strong',event.title||'Untitled appointment'),text('p',calendarWhen(event,calendarResult.timeZone),'ca-link-note'));
        if(event.location)item.append(text('p',event.location,'ca-link-note'));
        list.append(item);
      }
      host.append(list);
    }
    if(calendarResult.hasMore)host.append(text('p','More appointments are available in your calendar. This view shows up to 25.','ca-link-note'));
  }
  async function readCalendar() {
    if(!calendarAvailable()||!onScreen()||selected!=='google-workspace'||!dialog()?.open||calendarLoading)return;
    clearCalendar();calendarOpened=true;calendarLoading=true;
    const generation=calendarGeneration,started=epoch,revision=googleState.revision,controller=new AbortController();calendarController=controller;updateDialog();
    const current=()=>active()&&started===epoch&&generation===calendarGeneration&&revision===googleState.revision&&calendarAvailable()&&onScreen()&&selected==='google-workspace'&&dialog()?.open&&!controller.signal.aborted;
    try{
      const result=validCalendarResult(await googleRequest('calendar',undefined,{signal:controller.signal,revision}));
      if(!current())return;
      calendarResult=result;
    }catch(error){
      if(!current())return;
      calendarResult=null;calendarError=Object.prototype.hasOwnProperty.call(calendarMessages,error?.calendarCode)?calendarMessages[error.calendarCode]:'Appointments could not be loaded. Check Google status or try refreshing appointments.';
    }finally{
      if(!active()&&generation===calendarGeneration)clearCalendar();
      if(current()){calendarLoading=false;calendarController=null;updateDialog();}
    }
  }
  function googleActions() {
    const configured = googleState.configured && !['setup_required','unavailable'].includes(googleState.state);
    const locked = googleChecking || !!googleBusy || !configured || googleUncertain;
    const canDisconnect = googleState.hasSavedConnection && Number.isSafeInteger(googleState.revision) && googleState.revision >= 1 && !googleUncertain;
    const accountHtml = googleState.account ? '<div class="ca-linked-account"><span>Your Google account</span><strong>'+esc(googleState.account.email)+'</strong></div>' : googleState.hasSavedConnection ? '<p class="ca-link-note">Your saved Google connection is unavailable. You can still disconnect it from this app.</p>' : '';
    const manageNote = googleManageRequested ? '<div class="ca-setup-note"><strong>Enable Calendar editing</strong><p>The selected Calendar permission includes read, edit, share and delete access. This app currently changes only private appointments it created, after you review and confirm. No guests, invitations or reminders are added.</p></div>' : '';
    const editAction = !googleManageRequested && googleConnected() && googleState.services.some(s=>s.id==='calendar'&&s.authorized) && !googleState.calendarCapabilities?.manageOwn ? '<button type="button" class="ca-secondary" data-gw-calendar-manage>Enable Calendar editing</button>' : '';
    const choices = googleServices.map(service => '<label class="settings-row"><span><strong>'+service.name+'</strong><small>'+service.copy+' '+esc(googleStatus(service.id))+'.</small></span><input type="checkbox" data-gw-service="'+service.id+'" aria-label="'+service.name+' read and write access"'+(googleSelection.has(service.id)?' checked':'')+(locked?' disabled':'')+'></label>').join('');
    const setup = googleChecked && googleState.state === 'setup_required' ? '<div class="ca-setup-note"><strong>Google Workspace needs one-time setup.</strong><p>'+(['owner','admin'].includes(account.user?.role)?'An administrator must finish the app’s Google connection setup before people can approve their own accounts.':'Your administrator must finish Google connection setup first. Then you can approve your own account.')+'</p><p>Your Google sign-in is separate from permission to access Workspace data. No Google data is read by this screen.</p></div>' : '';
    const action = !googleChecked || googleChecking ? '<p class="ca-link-note">Checking available Google access…</p>' : !configured || googleUncertain ? '<button type="button" class="ca-secondary" data-gw-refresh>Check Google status</button>' : googleConsentUrl ? '<a class="ca-primary" href="'+esc(googleConsentUrl)+'" target="_top" rel="noreferrer">Continue to Google '+arrow+'</a>' : '<button type="button" class="ca-primary" data-gw-start'+(googleBusy || !googleSelection.size?' disabled':'')+'>'+(googleBusy?'Preparing approval…':googleManageRequested?'Enable Calendar editing':googleState.state==='reconnect_required'?'Reconnect with Google':googleState.state==='connected'?'Update Google access':'Continue with Google')+' '+arrow+'</button>';
    const disconnect = !canDisconnect ? '' : googleReview ? '<div class="ca-disconnect-review"><strong>Disconnect from Xtreme Avatar?</strong><p>This removes your saved connection and stops access to all Google services in this app. It does not delete Google data or revoke permissions used by other apps.</p><div><button type="button" class="ca-danger" data-gw-disconnect-confirm'+(googleBusy?' disabled':'')+'>Disconnect</button><button type="button" class="ca-secondary" data-gw-disconnect-cancel'+(googleBusy?' disabled':'')+'>Keep connected</button></div></div>' : '<button type="button" class="ca-secondary" data-gw-disconnect-review'+(googleBusy?' disabled':'')+'>Disconnect from Xtreme Avatar</button>';
    return accountHtml+setup+calendarActions()+editAction+manageNote+'<section class="ca-permissions"><h3>Choose Google access</h3><p class="ca-link-note">Use your chosen Google account. Approve only the services you want; you can decline individual permissions on Google. After successful approval, this app keeps only selected access. Unchecking does not revoke Google’s permission; manage that separately in Google.</p>'+choices+'</section>'+(googleManageRequested?'<p class="ca-link-note">Calendar editing is optional. Selected Google services request read and write permissions, including deletion permissions. App actions remain limited to the available tools and their review steps.</p>':'<p class="ca-link-note">This approval requests read and write access for selected services and can include deleting content. Gmail permission includes sending and permanently deleting mail. Meet is an existing Calendar link, not a separate connection; this does not create, join or record meetings.</p>')+action+'<p class="ca-link-note">Approved permissions alone do not enable every assistant tool. This screen does not offer email sending or file changes; Calendar changes require the available editing controls and a reviewed save. Review the scope of the Google grant separately from the actions currently available in this app.</p>'+disconnect+(googleState.account?'<a class="ca-secondary" href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Manage Google permissions ↗</a>':'')+'<p class="ca-detail-status" role="status" aria-live="polite">'+esc(googleNotice)+'</p>';
  }
  function googleDetails() {
    return '<div class="ca-dialog-top"><span class="ca-mark" aria-hidden="true">G</span><button type="button" class="ca-dialog-close" data-ca-close aria-label="Close app details">×</button></div><span class="ca-detail-kicker">YOUR GOOGLE ACCOUNT</span><h2 id="connected-app-title">Google Workspace</h2><span class="ca-badge'+(googleConnected()?' is-connected':'')+'">'+esc(googleStatus())+'</span><p class="ca-detail-copy">One approval flow for the Google services you choose.</p>'+googleActions();
  }
  function validGoogleStatus(data) {
    if (!data || !['setup_required','disconnected','connected','reconnect_required','unavailable'].includes(data.state) || typeof data.configured !== 'boolean' || !Array.isArray(data.services)) throw new Error('Google status could not be verified.');
    if (data.accountId && data.accountId !== owner) { account.invalidate?.('Your account session changed. Sign in again.'); throw new Error('Account session ended.'); }
    if (data.revision !== null && (!Number.isSafeInteger(data.revision) || data.revision < 0)) throw new Error('Google status could not be verified.');
    if (data.account !== null && (!data.account || typeof data.account.email !== 'string' || data.account.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.account.email))) throw new Error('Google status could not be verified.');
    if (data.state === 'connected' && (!data.configured || !data.account || !Number.isSafeInteger(data.revision) || data.revision < 1)) throw new Error('Google status could not be verified.');
    if (data.state === 'setup_required' && data.configured) throw new Error('Google status could not be verified.');
    if (data.hasSavedConnection !== undefined && typeof data.hasSavedConnection !== 'boolean') throw new Error('Google status could not be verified.');
    const hasSavedConnection = data.hasSavedConnection ?? !!data.account;
    if (hasSavedConnection && (!Number.isSafeInteger(data.revision) || data.revision < 1)) throw new Error('Google status could not be verified.');
    const calendarAccess=data.calendarAccess==='manage'?'manage':'read';
    const calendarCapabilities={read:false,create:false,manageOwn:false};
    if(data.calendarCapabilities!==undefined){for(const key of Object.keys(calendarCapabilities)){if(typeof data.calendarCapabilities?.[key]!=='boolean')throw new Error('Calendar capabilities could not be verified.');calendarCapabilities[key]=data.calendarCapabilities[key];}if(calendarAccess!=='manage'&&(calendarCapabilities.create||calendarCapabilities.manageOwn))throw new Error('Calendar editing permission could not be verified.');}
    const seen = new Set();
    const services = data.services.map(service => {
      if (!service || !googleIds.has(service.id) || seen.has(service.id) || typeof service.authorized !== 'boolean' || typeof service.enabled !== 'boolean' || (service.enabled && !service.authorized)) throw new Error('Google permissions could not be verified.');
      seen.add(service.id); return {id:service.id,authorized:service.authorized,enabled:service.enabled};
    });
    return {state:data.state,configured:data.configured,revision:data.revision,hasSavedConnection,calendarAccess,calendarCapabilities,account:data.account?{email:data.account.email,displayName:typeof data.account.displayName==='string'?data.account.displayName.slice(0,160):''}:null,services};
  }
  async function googleRequest(path,payload,readOptions) {
    if (!active()) throw new Error('Account session ended.');
    const started=epoch, controller=new AbortController(); controllers.add(controller);
    const timeout=setTimeout(()=>controller.abort(),85000);
    const abortRead=()=>controller.abort();
    if(readOptions?.signal){if(readOptions.signal.aborted)controller.abort();else readOptions.signal.addEventListener('abort',abortRead,{once:true});}
    try {
      const response=await fetch('/api/connections/google/'+path,{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'X-Xtreme-Account':owner,...(readOptions?.revision?{'X-Xtreme-Connection-Revision':String(readOptions.revision)}:{}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
      const data=await response.json();
      if (!active() || started!==epoch) throw new Error('Account session ended.');
      if (!response.ok) {
        if (response.status===401 || data?.code==='account_changed') account.invalidate?.('Your account session changed. Sign in again.',response.status===401);
        throw Object.assign(new Error(response.status===409?'Your Google connection changed. Refresh its status before trying again.':response.status===429?'Too many attempts. Wait a moment, then check Google status.':'Google access could not be confirmed. Check its status before trying again.'),{safeGoogle:true,...(path==='calendar'&&Object.prototype.hasOwnProperty.call(calendarMessages,data?.code)?{calendarCode:data.code}:{})});
      }
      return data;
    } catch(error) {
      if (error.name==='AbortError') throw new Error('The Google request timed out. Check its status before trying again.');
      if(error?.safeGoogle)throw error;
      throw new Error('Google access could not be confirmed. Check its status before trying again.');
    } finally {clearTimeout(timeout);controllers.delete(controller);readOptions?.signal?.removeEventListener('abort',abortRead);}
  }
  async function refreshGoogle() {
    if (!active() || googleChecking || googleBusy) return;
    clearCalendar();const started=epoch; googleChecking=true; googleConsentUrl=''; googleReview=false; changed();updateDialog();
    try {
      const result=validGoogleStatus(await googleRequest('status'));
      if (!active() || started!==epoch) return;
      googleState=result; googleUncertain=false;
      if (!googleSelectionEdited) googleSelection=new Set(result.services.filter(service=>service.authorized).map(service=>service.id));
      googleNotice=result.state==='connected'?'Your Google account and permissions were verified.':result.state==='reconnect_required'?'Google access needs your approval again.':result.state==='setup_required'?'Your administrator must finish Google connection setup.':result.state==='disconnected'?'Choose the Google services you want to connect.':'Google status is temporarily unavailable.';
      if (googleReturn==='cancelled') googleNotice='Google approval was cancelled. '+googleNotice;
      if (['error','reconnect'].includes(googleReturn)) googleNotice='Google approval did not finish. '+googleNotice;
      googleReturn='';
    } catch(error) {
      if (!active() || started!==epoch) return;
      googleState={state:'unavailable',configured:false,account:null,revision:null,services:[],hasSavedConnection:false};googleUncertain=true;googleNotice=error.message||'Google status could not be checked.';
    } finally {if(active()&&started===epoch){googleChecking=false;googleChecked=true;changed();updateDialog();}}
  }
  function googleAuthorizationUrl(value) {
    if (typeof value!=='string' || value.length>8192) throw new Error('The Google approval address could not be verified.');
    let url;try{url=new URL(value);}catch{throw new Error('The Google approval address could not be verified.');}
    if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.username||url.password||url.hash)throw new Error('The Google approval address could not be verified.');
    return url.href;
  }
  async function startGoogle() {
    if (!active()||!onScreen()||selected!=='google-workspace'||!dialog()?.open||googleBusy||googleChecking||googleUncertain||!googleState.configured||!['disconnected','connected','reconnect_required'].includes(googleState.state)||!googleSelection.size)return;
    clearCalendar();const started=epoch;googleBusy='start';googleNotice='';googleConsentUrl='';changed();updateDialog();
    try {
      const result=await googleRequest('start',{services:googleServices.filter(service=>googleSelection.has(service.id)).map(service=>service.id),...(googleSelection.has('calendar')?{calendarAccess:'manage'}:{})});
      const url=googleAuthorizationUrl(result?.authorizationUrl);
      if(!active()||started!==epoch)return;
      googleConsentUrl=url;googleNotice='Approve your selected access on Google. Then return here to verify it.';
      if(onScreen()&&selected==='google-workspace'&&dialog()?.open){try{window.top.location.assign(url);}catch{googleNotice='Use Continue to Google to open your approval page.';}}
    }catch(error){if(!active()||started!==epoch)return;googleUncertain=true;googleNotice=error.message||'Google approval could not start. Check its status.';}
    finally{if(active()&&started===epoch){googleBusy=null;changed();updateDialog();}}
  }
  async function disconnectGoogle() {
    if(!active()||!onScreen()||selected!=='google-workspace'||!dialog()?.open||!googleReview||googleBusy||googleChecking||googleUncertain||!googleState.hasSavedConnection||!Number.isSafeInteger(googleState.revision)||googleState.revision<1)return;
    clearCalendar();const started=epoch,revision=googleState.revision;googleBusy='disconnect';googleNotice='';changed();updateDialog();
    try{
      await googleRequest('disconnect',{confirm:true,revision});
      if(!active()||started!==epoch)return;
      googleState={state:'unavailable',configured:false,account:null,revision:null,services:[],hasSavedConnection:false};googleReview=false;googleSelection=new Set();googleSelectionEdited=false;googleBusy=null;await refreshGoogle();
    }catch(error){if(!active()||started!==epoch)return;googleState={state:'unavailable',configured:false,account:null,revision:null,services:[],hasSavedConnection:false};googleReview=false;googleUncertain=true;googleNotice=error.message||'Disconnection could not be confirmed. Check Google status.';}
    finally{if(active()&&started===epoch){googleBusy=null;changed();updateDialog();}}
  }
  function refreshAll(){void refreshGoogle();void refresh();}

  function active() { const current=!ended && !!owner && !account?.locked && account.user?.id === owner; if(!current&&calendarOpened)clearCalendar(); return current; }
  function onScreen() { return active() && location.hash === '#connections'; }
  function appById(id) { return apps.find(app => app.id === id); }
  function changed() { if (active()) window.dispatchEvent(new Event('xtreme:google-workspace-changed')); }
  function status(app) {
    if (app.id === 'twilio') return account.user?.role === 'owner' ? 'Owner line' : 'Personal line setup required';
    if (app.kind === 'google') return googleStatus(app.id);
    if (app.id !== 'call-desk') return app.kind === 'setup' ? 'Setup required' : app.status;
    if (checking) return 'Checking…';
    if (desk.status === 'linked' && desk.linked === true) return 'Connected';
    if (desk.status === 'pending') return 'Awaiting approval';
    if (desk.status === 'unlinked' || desk.status === 'revoked') return 'Not connected';
    return checked ? 'Check unavailable' : 'Not checked';
  }
  function cards() {
    const term = query.trim().toLowerCase();
    const matches = apps.filter(app => (category === 'all' || category === app.category) && [app.name, app.label, app.copy, ...(app.included || [])].join(' ').toLowerCase().includes(term));
    return matches.length ? matches.map(app => `<button type="button" class="ca-card" data-ca-app="${app.id}" aria-label="${esc(app.name)}. ${esc(status(app))}. View details"><span class="ca-mark ca-mark-${app.id}" aria-hidden="true">${app.mark}</span><span class="ca-card-copy"><strong>${app.name}</strong><small>${app.copy}</small><span class="ca-badge${(app.id === 'call-desk' && desk.linked === true && !checking) || (app.kind === 'google' && googleStatus(app.id) === 'Connected') ? ' is-connected' : ''}">${esc(status(app))}</span></span>${arrow}</button>`).join('') : '<div class="ca-empty"><strong>No matching apps</strong><p>Try a different name or category.</p></div>';
  }
  function render() {
    if (!active()) return '';
    const count = (desk.status === 'linked' && desk.linked === true && !checking ? 1 : 0) + (googleConnected() ? 1 : 0);
    return `<section class="connected-apps" aria-label="Connected apps"><div class="ca-intro"><span class="eyebrow">YOUR ACCOUNTS. YOUR CONTROL.</span><h2>Make your assistant more useful.</h2><p>Choose an app, review its access, and connect your own account when available.</p><div class="ca-summary"><span><strong>${count}</strong> verified account link${count === 1 ? '' : 's'}</span><button type="button" data-ca-refresh${checking || busy || googleChecking || googleBusy ? ' disabled' : ''}>${checking || googleChecking ? 'Checking…' : 'Refresh status'}</button></div></div><label class="ca-search" for="connected-app-search">${searchIcon}<span class="sr-only">Search connected apps</span><input id="connected-app-search" type="search" value="${esc(query)}" maxlength="80" placeholder="Search apps" autocomplete="off"></label><div class="ca-filters" role="group" aria-label="Filter apps">${[['all','All apps'],['google','Google'],['assistant','AI & voice'],['business','Business']].map(([id,label]) => `<button type="button" data-ca-category="${id}" aria-pressed="${category === id}">${label}</button>`).join('')}</div><p class="ca-hub-status" role="status" aria-live="polite">${esc(googleNotice || notice || (googleChecking ? 'Checking your Google account…' : 'Choose Google Workspace to review your personal Google access.'))}</p><div class="ca-app-list" id="connected-app-list">${cards()}</div><p class="ca-footer-note">Connecting an app does not grant unlimited autonomy. You keep control of permissions and external actions.</p></section>`;
  }
  function dialog() { return document.querySelector('#connected-app-dialog'); }
  function detailHtml(app) {
    if (app.kind === 'google') return googleDetails();
    const linked = app.id === 'call-desk' && desk.status === 'linked' && desk.linked === true && !checking;
    const google = app.kind === 'google';
    return `<div class="ca-dialog-top"><span class="ca-mark ca-mark-${app.id}" aria-hidden="true">${app.mark}</span><button type="button" class="ca-dialog-close" data-ca-close aria-label="Close app details">×</button></div><span class="ca-detail-kicker">${esc(app.label)}</span><h2 id="connected-app-title">${app.name}</h2><span class="ca-badge${linked ? ' is-connected' : ''}">${esc(status(app))}</span><p class="ca-detail-copy">${esc(app.copy)}</p>${app.included?.length ? `<div class="ca-included">${app.included.map(name => `<span>${name}</span>`).join('')}</div>` : ''}<section class="ca-permissions"><h3>${google ? 'Access after setup' : 'What you are allowing'}</h3><ul>${app.permissions.map(permission => `<li>${esc(permission)}</li>`).join('')}</ul></section>${google ? `<div class="ca-setup-note"><strong>Google approval is not enabled yet.</strong><p>The Site owner must enable approved visitor connections before you can connect your Google account. No Google data is read here.</p><p>Each person will sign in and approve their own account. The owner’s Google connections are not shared with visitors.</p></div><a class="ca-secondary" href="${app.url}" target="_blank" rel="noopener noreferrer">Open ${app.name} <span aria-hidden="true">↗</span></a><small class="ca-link-note">Opens Google separately. It does not connect this app.</small>` : app.kind === 'setup' ? setupActions(app) : app.id === 'call-desk' ? deskActions() : `<button type="button" class="ca-primary" ${app.video ? 'data-open-session="video"' : `data-route="${app.route}"`} data-ca-launch>${app.action} ${arrow}</button><p class="ca-link-note">Opens an existing app feature; does not link a personal provider account.</p>`}<p class="ca-detail-status" role="status" aria-live="polite">${app.id === 'call-desk' ? esc(notice) : ''}</p>`;
  }
  function setupActions(app) {
    const text='<div class="ca-setup-note"><strong>Visitor access needs setup.</strong><p>This connection is not available yet. No credentials or permissions are requested.</p></div>';
    if(app.id!=='etherverse')return text;
    return text+'<p class="ca-link-note">Agent jobs are not dispatched from this app yet. Work will appear as complete only after its result is verified.</p>'+(account.user?.role==='owner'?'<a class="ca-secondary" href="https://etherverse-bio-digital-bus-app.strategic-ai.chatgpt.site" target="_blank" rel="noopener noreferrer">Open Etherverse workspace ↗</a><p class="ca-link-note">Separate authorized sign-in required.</p>':'');
  }
  function deskActions() {
    if (checking) return '<p class="ca-link-note">Checking this account’s connection…</p>';
    if (desk.status === 'linked' && desk.linked === true) {
      return `<div class="ca-linked-account"><span>Verified for this account</span><strong>${esc(desk.displayName || 'Your Call Desk account')}</strong></div><a class="ca-primary" href="https://eden-skye-call-desk.strategic-ai.chatgpt.site/account" target="_blank" rel="noopener noreferrer">Manage profile & memory <span aria-hidden="true">↗</span></a><p class="ca-link-note ca-memory-note">Use Remember, Edit, and Forget in your own Call Desk account. Approved profile context applies to new GPT chat and voice sessions, not Tavus video or phone calls. Chat and audio are not automatically saved as memories.</p>${disconnectReview ? '<div class="ca-disconnect-review"><strong>Disconnect this account link?</strong><p>This stops future access through this link. It does not delete your Call Desk account or records already saved.</p><div><button type="button" class="ca-danger" data-ca-disconnect-confirm'+(busy ? ' disabled' : '')+'>Disconnect</button><button type="button" class="ca-secondary" data-ca-disconnect-cancel'+(busy ? ' disabled' : '')+'>Keep connected</button></div></div>' : `<button type="button" class="ca-secondary" data-ca-disconnect-review${busy ? ' disabled' : ''}>Disconnect account</button>`}`;
    }
    if (busy) return '<p class="ca-link-note">Preparing your secure approval page…</p>';
    if (consentUrl) return `<a class="ca-primary" href="${esc(consentUrl)}" target="_top" rel="noreferrer">Continue to Call Desk ${arrow}</a><p class="ca-link-note">Review and approve the connection in your own Call Desk account.</p>`;
    if (uncertain || !['unlinked','pending','revoked'].includes(desk.status)) return '<button type="button" class="ca-secondary" data-ca-refresh>Check connection</button><p class="ca-link-note">Verify the current status before starting another connection request.</p>';
    return `<button type="button" class="ca-primary" data-ca-connect>${desk.status === 'pending' ? 'Continue approval' : 'Connect Call Desk'} ${arrow}</button><p class="ca-link-note">You’ll open Call Desk, sign in, and explicitly approve this link. No API keys are needed.</p>`;
  }
  function updateDialog() { const element = dialog(), app = appById(selected); if (element?.open && app && active()) {element.innerHTML = detailHtml(app);renderCalendar();} }
  function closeDialog() { googleManageRequested=false; clearCalendar(); const element = dialog(); if (element?.open) element.close(); selected = null; disconnectReview = false; googleReview = false; if (active() && opener?.isConnected) opener.focus?.(); opener = null; }
  function openDetails(id, target) {
    if (!onScreen()) return;
    const app = appById(id); if (!app) return;
    if(selected && selected !== (app.kind === 'google' ? 'google-workspace' : id))clearCalendar();
    selected = app.kind === 'google' ? 'google-workspace' : id; opener = target; disconnectReview = false; googleReview = false;
    if (app.kind === 'google' && id !== 'google-workspace' && googleIds.has(id) && !googleState.services.some(service=>service.id===id&&service.authorized)) {googleSelection.add(id);googleSelectionEdited=true;}
    let element = dialog();
    if (!element) { element = document.createElement('dialog'); element.id = 'connected-app-dialog'; element.className = 'ca-dialog'; element.setAttribute('aria-labelledby','connected-app-title'); element.addEventListener('close', () => { clearCalendar(); selected = null; disconnectReview = false; if (active() && opener?.isConnected) opener.focus?.(); opener = null; }); document.body.append(element); }
    element.innerHTML = detailHtml(app); renderCalendar(); if (!element.open) element.showModal(); element.querySelector('[data-ca-close]')?.focus();
    if (id === 'call-desk' && !checked && !checking) void refresh();
    if (app.kind === 'google' && !googleChecked && !googleChecking) void refreshGoogle();
  }
  async function request(path, payload) {
    if (!active()) throw new Error('Account session ended.');
    const started = epoch, controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/call-desk-link/'+path, { method:payload ? 'POST' : 'GET', credentials:'same-origin', cache:'no-store', signal:controller.signal, headers:{'X-Xtreme-Account':owner,...(payload ? {'Content-Type':'application/json'} : {})}, ...(payload ? {body:JSON.stringify(payload)} : {}) });
      const data = await response.json();
      if (!active() || started !== epoch) throw new Error('Account session ended.');
      if (!response.ok) {
        if (response.status === 401 || data?.code === 'account_changed') account.invalidate?.('Your account session changed. Sign in again.', response.status === 401);
        const message = response.status === 409 ? 'The connection changed. Refresh its status before trying again.' : response.status === 429 ? 'Too many attempts. Wait a moment before checking again.' : [404,503].includes(response.status) ? 'Call Desk account linking is not available yet. Please check again after setup.' : 'The connection request could not be confirmed. Check its status before trying again.';
        throw Object.assign(new Error(message), {status:response.status});
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The request timed out. Check the connection status before trying again.');
      throw error;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  function validStatus(data) {
    if (!data || !['unlinked','pending','linked','revoked'].includes(data.status) || typeof data.linked !== 'boolean' || data.linked !== (data.status === 'linked')) throw new Error('The connection status could not be verified.');
    if (data.linked && (!Number.isSafeInteger(data.revision) || data.revision < 1)) throw new Error('The connection status could not be verified.');
    return {status:data.status,linked:data.linked,...(data.linked ? {revision:data.revision,displayName:typeof data.displayName === 'string' ? data.displayName.slice(0,160) : ''} : {})};
  }
  async function refresh() {
    if (!active() || checking || busy) return;
    const started = epoch; checking = true; notice = ''; consentUrl = ''; disconnectReview = false; changed(); updateDialog();
    try { const result = validStatus(await request('status')); if (!active() || started !== epoch) return; desk = result; uncertain = false; notice = result.linked ? 'Call Desk account link verified.' : result.status === 'pending' ? 'Call Desk approval is pending. Approve there, then refresh this status.' : 'Your Call Desk account is not linked yet.'; }
    catch (error) { if (!active() || started !== epoch) return; desk = {status:'unknown',linked:false}; notice = error.message || 'The connection status could not be checked.'; }
    finally { if (active() && started === epoch) { checking = false; checked = true; changed(); updateDialog(); } }
  }
  function allowedConsentUrl(value) {
    if (typeof value !== 'string' || value.length > 8192) throw new Error('The secure approval address could not be verified.');
    let url; try { url = new URL(value); } catch { throw new Error('The secure approval address could not be verified.'); }
    if (url.origin !== DESK_ORIGIN || url.pathname !== '/connect/xtreme' || url.username || url.password || url.search || !/^#ticket=[A-Za-z0-9_.~-]+$/.test(url.hash)) throw new Error('The secure approval address could not be verified.');
    return url.href;
  }
  async function connect() {
    if (!active() || checking || busy || uncertain || !['unlinked','pending','revoked'].includes(desk.status)) return;
    const started = epoch; busy = 'connect'; notice = ''; consentUrl = ''; changed(); updateDialog();
    try {
      const result = await request('start', {}), url = allowedConsentUrl(result?.connectUrl);
      if (!active() || started !== epoch) return;
      consentUrl = url; desk = {status:'pending',linked:false}; notice = 'Approve the connection in your own Call Desk account.';
      if (onScreen() && selected === 'call-desk' && dialog()?.open) { try { window.top.location.assign(url); } catch { notice = 'Use Continue to open the secure Call Desk approval page.'; } } else notice = 'Your approval page is ready. Open Call Desk details to continue.';
    } catch (error) { if (!active() || started !== epoch) return; uncertain = true; notice = error.message || 'The approval request could not be confirmed. Check its status.'; }
    finally { if (active() && started === epoch) { busy = null; changed(); updateDialog(); } }
  }
  async function disconnect() {
    if (!active() || checking || busy || !disconnectReview || desk.status !== 'linked' || !desk.linked || !Number.isSafeInteger(desk.revision)) return;
    const started = epoch, revision = desk.revision; busy = 'disconnect'; notice = ''; changed(); updateDialog();
    try { await request('disconnect', {confirm:true,revision}); if (!active() || started !== epoch) return; desk = {status:'unknown',linked:false}; disconnectReview = false; busy = null; await refresh(); }
    catch (error) { if (!active() || started !== epoch) return; desk = {status:'unknown',linked:false}; disconnectReview = false; uncertain = true; notice = error.message || 'Disconnection could not be confirmed. Refresh its status.'; }
    finally { if (active() && started === epoch) { busy = null; changed(); updateDialog(); } }
  }
  document.addEventListener('click', event => {
    if (!active()) return;
    const target = event.target;
    const card = target.closest?.('[data-ca-app]'); if (card) { event.preventDefault(); openDetails(card.dataset.caApp, card); return; }
    const filter = target.closest?.('[data-ca-category]'); if (filter && onScreen() && ['all','google','assistant','business'].includes(filter.dataset.caCategory)) { event.preventDefault(); category = filter.dataset.caCategory; changed(); document.querySelector('[data-ca-category="'+category+'"]')?.focus(); return; }
    if (target.closest?.('[data-ca-close]')) { event.preventDefault(); closeDialog(); return; }
    if (target.closest?.('[data-ca-launch]')) { closeDialog(); return; }
    if (target.closest?.('[data-ca-refresh]') && onScreen()) { event.preventDefault(); refreshAll(); return; }
    if (target.closest?.('[data-gw-refresh]') && onScreen()) {event.preventDefault();void refreshGoogle();return;}
    if (target.closest?.('[data-gw-calendar-manage]')) {event.preventDefault();googleManageRequested=true;googleSelection.add('calendar');googleSelectionEdited=true;googleConsentUrl='';updateDialog();return;}
    if (target.closest?.('[data-gw-calendar-read]')) {event.preventDefault();void readCalendar();return;}
    if (target.closest?.('[data-gw-start]')) {event.preventDefault();void startGoogle();return;}
    if (target.closest?.('[data-gw-disconnect-review]') && selected==='google-workspace' && dialog()?.open && !googleBusy) {event.preventDefault();clearCalendar();googleReview=true;updateDialog();return;}
    if (target.closest?.('[data-gw-disconnect-cancel]') && !googleBusy) {event.preventDefault();googleReview=false;updateDialog();return;}
    if (target.closest?.('[data-gw-disconnect-confirm]')) {event.preventDefault();void disconnectGoogle();return;}
    if (target.closest?.('[data-ca-connect]') && selected === 'call-desk' && dialog()?.open) { event.preventDefault(); void connect(); return; }
    if (target.closest?.('[data-ca-disconnect-review]') && selected === 'call-desk' && !busy) { event.preventDefault(); disconnectReview = true; updateDialog(); return; }
    if (target.closest?.('[data-ca-disconnect-cancel]') && !busy) { event.preventDefault(); disconnectReview = false; updateDialog(); return; }
    if (target.closest?.('[data-ca-disconnect-confirm]') && selected === 'call-desk' && dialog()?.open) { event.preventDefault(); void disconnect(); }
  });
  document.addEventListener('change',event=>{const control=event.target.closest?.('[data-gw-service]'),id=control?.dataset.gwService;if(!control||!googleIds.has(id)||!active()||!onScreen()||selected!=='google-workspace'||!dialog()?.open||googleBusy||googleChecking||googleUncertain||!googleState.configured)return;if(control.checked)googleSelection.add(id);else googleSelection.delete(id);googleSelectionEdited=true;googleConsentUrl='';const button=dialog()?.querySelector('[data-gw-start]');if(button)button.disabled=!googleSelection.size;});
  document.addEventListener('input', event => { if (!onScreen() || event.target.id !== 'connected-app-search') return; query = event.target.value.slice(0,80); const list = document.querySelector('#connected-app-list'); if (list) list.innerHTML = cards(); });
  window.addEventListener('hashchange', () => { if (!onScreen()) { closeDialog(); return; } refreshAll(); });
  window.addEventListener('pageshow', event => { if (event.persisted && onScreen()) refreshAll(); });
  window.addEventListener('focus', () => { if (onScreen()) refreshAll(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && onScreen()) refreshAll(); });
  window.addEventListener('xtreme:account-ended', () => { clearCalendar(); ended = true; epoch++; googleState={state:'unavailable',configured:false,account:null,revision:null,services:[],hasSavedConnection:false};googleChecked=false;googleChecking=false;googleBusy=null;googleNotice='';googleReview=false;googleUncertain=false;googleConsentUrl='';googleSelection.clear();googleSelectionEdited=false;googleReturn='';for (const controller of controllers) controller.abort(); controllers.clear(); closeDialog(); dialog()?.remove(); desk = {status:'unknown',linked:false}; query = ''; selected = null; consentUrl = ''; notice = ''; busy = null; checking = false; document.querySelector('.connected-apps')?.replaceChildren(); });
  function openCalendarAccess(){if(!active())return false;googleManageRequested=true;googleSelection.add('calendar');googleSelectionEdited=true;googleConsentUrl='';if(location.hash!=='#connections')location.hash='#connections';setTimeout(()=>{if(active()&&onScreen()){openDetails('google-workspace',null);updateDialog();}},0);return true;}
  window.XtremeGoogleWorkspace = {render,openCalendarAccess};
  window.dispatchEvent(new Event('xtreme:google-workspace-ready'));
  if (onScreen()) refreshAll();
})();
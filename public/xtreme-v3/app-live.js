/* Xtreme Avatar authenticated application adapter.
 * Uses existing audited Next/Supabase routes, not a second API, auth or memory store.
 * Every provider feature defaults to unavailable until an actual authenticated read.
 */
(function () {
  'use strict';
  const state = {
    phase: 'checking', user: null, account: null, work: null,
    chatReady: false, chatMessages: [], chatPending: false,
    voiceReady: false, voiceRequestId: null, voiceSessionId: null,
    voiceState: 'idle', voicePc: null, voiceStream: null, voiceAudio: null,
    google: null, errors: {}, saving: false
  };
  const safe = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const text = (value, limit) => safe(String(value == null ? '' : value).slice(0, limit || 300));
  const label = (value) => '<span class="tag">' + safe(value) + '</span>';
  const box = (title, description, extra) => card('<div class="feature-box"><strong>' +
    safe(title) + '</strong><small>' + safe(description || '') + '</small>' + (extra || '') + '</div>', 'pad');
  const action = (name, title, kind, disabled) =>
    '<button type="button" class="cta ' + safe(kind || 'subtle') +
    '" data-live="' + safe(name) + '"' + (disabled ? ' disabled' : '') + '>' + safe(title) + '</button>';
  const login = () => '<a class="cta primary" href="/auth/login?return_to=%2F">Continue with Google</a>';
  const authStatus = () => state.phase === 'checking' ? 'Checking account'
    : state.phase === 'signed-out' ? 'Sign in required'
    : state.phase === 'error' ? 'Account service unavailable'
    : 'Signed in';
  const isAuthed = () => state.phase === 'ready' && !!state.user;
  const note = message => typeof showNotice === 'function' ? showNotice(message) : console.info(message);
  const show = () => { if (typeof render === 'function') render(); updateStatus(); };
  function updateStatus() {
    const element = document.getElementById('connection-status');
    if (!element) return;
    element.textContent = isAuthed() ? 'SIGNED IN · ' + String(state.user.role || 'member').toUpperCase() :
      state.phase === 'checking' ? 'VERIFYING ACCOUNT' : authStatus().toUpperCase();
    element.dataset.status = state.phase;
  }
  function authView() {
    if (state.phase === 'checking') return box('Secure account', 'Checking your existing Xtreme Avatar account.');
    if (state.phase === 'signed-out') return box('Your private workspace', 'Sign in with Google to use chat, saved work and authorized provider connections.', login());
    return box('Connection unavailable', state.errors.account || 'Your account could not be verified. No private data has been opened.', action('retry', 'Retry connection'));
  }
  function requireAuth(content) { return isAuthed() ? content : authView(); }
  async function api(path, data, timeout) {
    if (!path.startsWith('/api/') || path.includes('://')) throw Error('Invalid application route.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 14000);
    const headers = { Accept: 'application/json' };
    if (state.user && state.user.id) headers['X-Xtreme-Account'] = state.user.id;
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetch(path, {
        method: data === undefined ? 'GET' : 'POST',
        credentials: 'same-origin', cache: 'no-store', headers,
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(typeof payload.error === 'string' ? payload.error : 'The secure request could not complete.');
        error.status = response.status;
        error.code = payload.code;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('The request timed out. Check the saved state before retrying.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function refreshWork() {
    try { state.work = await api('/api/work-hub'); delete state.errors.work; }
    catch (error) { state.work = null; state.errors.work = error.message; }
  }
  async function refreshChat() {
    try {
      const [status, history] = await Promise.all([
        api('/api/assistant/status'), api('/api/assistant/chat')
      ]);
      state.chatReady = status.chat && status.chat.ready === true;
      state.chatMessages = Array.isArray(history.messages) ? history.messages : [];
      state.chatPending = history.pending === true;
      state.errors.chat = status.chat && !status.chat.ready ? status.chat.reason : '';
    } catch (error) {
      state.chatReady = false;
      state.errors.chat = error.message;
    }
  }
  async function refreshVoice() {
    try {
      const status = await api('/api/assistant/voice/status');
      state.voiceReady = status.ready === true;
      state.errors.voice = status.reason || '';
      if (status.pendingRequest && status.pendingRequest.requestId) {
        state.voiceRequestId = status.pendingRequest.requestId;
        if (state.voiceState !== 'active') state.voiceState = 'uncertain';
      }
    } catch (error) { state.voiceReady = false; state.errors.voice = error.message; }
  }
  async function refreshGoogle() {
    if (!isAuthed()) return;
    try { state.google = await api('/api/connections/google/status'); delete state.errors.google; }
    catch (error) { state.google = null; state.errors.google = error.message; }
  }
  async function start() {
    const previous = state.user && state.user.id;
    state.phase = 'checking'; show();
    try {
      const account = await api('/api/account');
      if (!account.user || !account.user.id) throw Error('Account verification did not return a member.');
      if (previous && previous !== account.user.id) {
        state.chatMessages = []; state.work = null; state.google = null;
        await closeLocalVoice();
      }
      state.user = account.user;
      state.account = account;
      state.phase = 'ready'; delete state.errors.account;
      show();
      await Promise.allSettled([refreshWork(), refreshChat(), refreshVoice(), refreshGoogle()]);
      show();
    } catch (error) {
      state.phase = error.status === 401 ? 'signed-out' : 'error';
      state.user = null; state.account = null; state.work = null;
      state.chatMessages = []; state.google = null; state.chatReady = false; state.voiceReady = false;
      state.errors.account = error.message;
      await closeLocalVoice();
      show();
    }
  }
  function homeLive() {
    const name = isAuthed() ? (state.account && state.account.data &&
      state.account.data.profile && state.account.data.profile.name) || '' : '';
    const introduction = head(isAuthed() ? 'Welcome' + (name ? ', ' + text(name, 40) : '') : 'Welcome to Xtreme Avatar',
      'Your AI workspace, real conversations and saved work under your account.');
    if (!isAuthed()) return introduction + authView() + action('retry', 'Refresh account');
    const voiceText = state.voiceReady ? 'Voice service available; microphone permission required'
      : 'Voice awaiting verified provider session';
    const hero = '<button class="card gold hero-card" data-go="chat" aria-label="Open Eden chat">' +
      '<span class="mic">' + svgIcon('spark') + '</span><span class="hero-copy"><strong>Talk to Eden</strong>' +
      '<small>Open your private conversation</small><span class="hint">' +
      (state.chatReady ? '● Chat connection verified' : '● Chat needs provider connection') +
      '</span></span><span class="arrow">' + svgIcon('arrow') + '</span></button>';
    const shortcuts = [['mic','Voice','voice'],['video','Video','video'],['tasks','Work Hub','tasks'],
      ['calendar','Calendar','calendar'],['ideas','Ideas','ideas'],['approvals','Approvals','approvals']];
    const quick = '<h2 class="section-heading">Quick actions</h2><div class="grid three">' +
      shortcuts.map(([icon,title,p]) => '<button class="card action-tile" data-go="' + p + '">' +
        svgIcon(icon) + '<strong>' + title + '</strong></button>').join('') + '</div>';
    const open = state.work && Array.isArray(state.work.jobs) ?
      state.work.jobs.filter(j => j.stage !== 'complete').slice(0,4) : [];
    const summary = '<h2 class="section-heading">Your current work</h2>' +
      (state.work ? (open.length ? '<div class="stack">' +
        open.map(j => row('tasks', safe(j.name), safe(j.stage || 'Saved'), 'tasks')).join('') + '</div>'
        : box('No active jobs', 'Save your first job or idea from the Work Hub.')) :
        box('Work Hub connection', state.errors.work || 'Checking saved work.'));
    return introduction + hero + quick + box('Voice status', voiceText, action('refresh', 'Refresh connections')) + summary;
  }
  function chatLive() {
    if (!isAuthed()) return head('Eden Chat', 'Your private authenticated conversation.') + authView();
    const messages = state.chatMessages.map(message => {
      const who = message.role === 'assistant' ? 'Eden' : 'You';
      return '<div class="card pad" style="margin-bottom:9px"><strong>' + who + '</strong>' +
        '<p style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:7px">' +
        text(message.content, 12000) + '</p></div>';
    }).join('');
    const status = state.chatReady ? label('AI CHAT READY') :
      label('CHAT NOT VERIFIED') + '<p class="screen-note">' + safe(state.errors.chat || 'The provider is not configured for this account.') + '</p>';
    const form = '<form id="live-chat-form"><label class="field"><span>Message Eden</span>' +
      '<textarea name="message" maxlength="4000" rows="3" placeholder="What would you like help with?" required></textarea></label>' +
      '<button class="cta primary" type="submit"' + (!state.chatReady || state.chatPending || state.saving ? ' disabled' : '') +
      '>Send message</button></form>';
    return head('Eden Chat', 'Private history from your verified account, not sample messages.') +
      status + '<h2 class="section-heading">Conversation</h2>' +
      (messages || box('No messages yet', 'Send a message when your secure AI connection is ready.')) +
      (state.chatPending ? box('Request pending', 'An earlier reply is being processed. Refresh before sending again.', action('refresh', 'Refresh status')) : '') +
      form + action('refresh', 'Refresh conversation', 'subtle');
  }
  function tasksLive() {
    if (!isAuthed()) return head('Work Hub', 'Private jobs and saved work.') + authView();
    const hub = state.work;
    const createForm = '<form id="live-job-form"><label class="field"><span>Job or task name</span>' +
      '<input name="name" maxlength="100" required placeholder="What needs to be done?"></label>' +
      '<label class="field"><span>Notes</span><textarea name="notes" maxlength="2000" placeholder="Scope, requirements or context"></textarea></label>' +
      '<button class="cta primary" type="submit">Save to my Work Hub</button></form>';
    if (!hub) return head('Work Hub', 'Saved account work.') + box('Work Hub unavailable', state.errors.work || 'No verified connection.',action('refresh','Retry'));
    const records = hub.jobs.map(j => '<div class="card pad" style="margin-bottom:10px">' +
      '<strong>' + text(j.name, 100) + '</strong><p class="subtitle">' + text(j.notes, 400) + '</p>' +
      '<p class="screen-note">Stage: ' + text(j.stage, 20) + '</p>' +
      (j.stage !== 'complete' ? action('finish-job:' + j.id, 'Mark complete') : label('Completed')) +
      action('delete-job:' + j.id, 'Remove', 'subtle') + '</div>').join('');
    return head('Work Hub', 'Real saved work scoped to your account.') +
      label(String(hub.jobs.length) + ' SAVED JOBS') +
      '<h2 class="section-heading">Your jobs</h2>' +
      (records || box('No saved jobs', 'Start with a task or client project.')) +
      '<h2 class="section-heading">New work</h2>' + card(createForm, 'pad');
  }
  function finishedLive() {
    if (!isAuthed()) return head('Saved results', 'Account-linked documents and notes.') + authView();
    const results = state.work && Array.isArray(state.work.results) ? state.work.results : [];
    return head('Saved results', 'Only records actually saved in your account appear here.') +
      (state.work ? (results.length ? results.map(r =>
        card('<strong>' + text(r.title,100) + '</strong><p class="subtitle">' +
          text(r.text,5000) + '</p>' + label('Saved by you'), 'pad')).join('') :
          box('No saved results', 'Create a note from Ideas. Auto-generated artifacts need a verified Foreman execution receipt.')) :
          box('Results unavailable',state.errors.work || 'Waiting for account storage.'));
  }
  function ideaLive() {
    if (!isAuthed()) return head('Idea Notebook', 'Turn a thought into saved work.') + authView();
    return head('Idea Notebook', 'Capture real ideas in your private workspace. AI research and builds require a verified Foreman connection.') +
      card('<form id="live-idea-form"><label class="field"><span>Idea title</span>' +
      '<input name="title" maxlength="100" required placeholder="Describe your idea"></label>' +
      '<label class="field"><span>Details</span><textarea name="details" maxlength="6000" required placeholder="Goals and requirements"></textarea></label>' +
      '<button class="cta primary" type="submit">Save idea</button></form>', 'pad') +
      action('refresh','Refresh saved results');
  }
  function workspaceLive() {
    if (!isAuthed()) return head('Workspace', 'Only connected services are available.') + authView();
    const google = state.google;
    const info = google ? 'Authenticated connection response received. Check each Google permission before using it.' :
      (state.errors.google || 'Google Workspace authorization has not been verified for this account.');
    return head('Workspace & Connections', 'Every connected service needs its own explicit authorization.') +
      box('Google Workspace', info, action('refresh','Refresh Google status')) +
      box('Eden Core', 'The shared-brain bridge is staged separately. A connected ChatGPT plugin is not a valid website API credential.') +
      box('Tavus, Twilio and browser', 'These providers require verified per-account permissions and working transport. No simulation is being presented as a live service.');
  }
  function voiceLive() {
    if (!isAuthed()) return head('Voice with Eden','Secure real-time voice')+authView();
    let content = head('Voice with Eden', 'The microphone opens only after you select Start. Active calls use metered provider resources.');
    content += box('Provider connection',
      state.voiceReady ? 'The approved voice adapter reports ready. Confirm microphone access to begin.' :
        state.errors.voice || 'No verified live voice session is available.',
      state.voiceReady ? label('VOICE READY') : label('NEEDS CONNECTION'));
    if (state.voiceState === 'active') content += box('Voice call active',
      'Your audio session is connected. End the session when finished.', action('end-voice','End voice call','primary'));
    else if (state.voiceState === 'connecting') content += box('Connecting','Requesting microphone and negotiating secure audio.');
    else if (state.voiceState === 'uncertain') content += box('Check previous call',
      'An earlier voice request may still exist. Do not launch another paid session until its status is reconciled.',
      action('check-voice','Check call status','primary'));
    else content += state.voiceReady ? card('<label class="checkline"><input type="checkbox" id="live-mic-consent">I agree to start a metered voice session and grant microphone access.</label>' +
      action('start-voice','Start voice call','primary'), 'pad') : '';
    return content + action('refresh','Refresh voice availability');
  }
  function videoLive() {
    return head('Video Avatar', 'Tavus must establish a verified, consented video session.') +
      authViewIfNeeded() +
      box('Live Tavus video', 'No authenticated Tavus session has been established by this interface. Select a verified avatar in the connected Avatar Studio when available. Static portraits are not video calls.', label('VIDEO CONNECTION REQUIRED')) +
      action('refresh','Refresh connections');
  }
  function authViewIfNeeded() { return isAuthed() ? '' : authView(); }
  function approvalsLive() {
    return head('Approvals','Only real versioned approval records can be approved.') +
      authViewIfNeeded() + box('Approvals',
      'A signed, tenant-scoped approval service is required. There are no fabricated pending approvals in this interface.',
      label('NO VERIFIED APPROVALS'));
  }
  function calendarLive() {
    return head('Calendar','Google Calendar requires a separate verified Workspace grant.') +
      authViewIfNeeded() + box('Calendar connection', state.errors.google || 'Use Workspace to inspect your Google authorization.',
        '<button data-go="workspace" class="cta subtle">Open Workspace</button>');
  }
  function moreLive() {
    return head('Control Center', 'Real account settings, appearance and provider connection status.') +
      '<div class="stack">' +
      row('spark','Choose a skin','Device appearance only; never changes permissions','customize') +
      row('tasks','Saved work and results','Account-scoped Work Hub','tasks') +
      row('calendar','Workspace connections','Inspect available Google connections','workspace') +
      row('approvals','Approval status','Requires a verified approval service','approvals') +
      row('home','Account settings','Verified identity and display name','onboarding') +
      row('ideas','Privacy and consent','Review service information','privacy') +
      '</div>' + (isAuthed() ?
        card('<strong>Account</strong><p class="subtitle">' + text(state.user.email,254) +
        '</p><form action="/auth/logout" method="post"><button class="cta subtle" type="submit">Sign out</button></form>','pad') : authView());
  }
  function settingsLive() {
    if (!isAuthed()) return head('Account settings','Sign in to change account details.') + authView();
    const current = state.account && state.account.data && state.account.data.profile && state.account.data.profile.name || '';
    return head('Account settings','Profile updates are saved through your existing private account API.') +
      card('<p class="subtitle">' + text(state.user.email,254) + ' · ' + text(state.user.role,40) + '</p>' +
      '<form id="live-profile-form"><label class="field"><span>Display name</span>' +
      '<input name="name" maxlength="40" required value="' + text(current,40) + '"></label>' +
      '<button class="cta primary" type="submit">Save display name</button></form>', 'pad') +
      box('Operating mode', 'Manual, Hybrid and Full Auto require explicit backend policy and safe authorization. This page does not silently activate account-wide autonomy.');
  }
  function customizeLive() {
    return head('Skin Studio','Choose your appearance without changing AI permissions.') +
      '<div class="skin-swatches">' + Object.entries(skins).map(([key,value]) =>
        '<button class="skin-swatch" data-skin="' + key + '">' +
        '<span class="swatchdot"></span>' + safe(value) + (skin === key ? ' ✓' : '') +
        '</button>').join('') + '</div>' +
      '<p class="screen-note">Skin choice is saved on this device. Cross-device sync requires an authorized profile preference.</p>';
  }
  async function createJob(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name')||'').trim();
    const notes = String(fd.get('notes')||'').trim();
    if (!name || name.length > 100 || notes.length > 2000) throw Error('Check the job name and notes.');
    if (!state.work) throw Error('Work Hub is not connected.');
    await api('/api/work-hub/jobs',{action:'create',version:state.work.version,id:crypto.randomUUID(),
      data:{name,client:'',location:'',stage:'lead',dueDate:'',notes,links:[]}});
    await refreshWork(); show(); note('Job saved to your private Work Hub.');
  }
  async function createIdea(form) {
    const fd = new FormData(form);
    const title = String(fd.get('title')||'').trim(),details=String(fd.get('details')||'').trim();
    if (!title || !details || title.length>100 || details.length>6000) throw Error('Add a title and details.');
    if (!state.work) throw Error('Results storage is not connected.');
    await api('/api/work-hub/results',{action:'create',version:state.work.version,id:crypto.randomUUID(),
      data:{title,kind:'note',text:details,links:[]}});
    await refreshWork(); show(); note('Idea saved to your private results.');
  }
  async function updateJob(type,id) {
    if (!state.work) throw Error('Work Hub is not connected.');
    const job = state.work.jobs.find(j => j.id === id);
    if (!job) throw Error('The saved item has changed. Refresh.');
    if (type === 'delete' && !confirm('Remove this saved job from your account?')) return;
    const payload = type === 'delete' ?
      {action:'delete',version:state.work.version,id} :
      {action:'update',version:state.work.version,id,
        data:{name:job.name,client:job.client,location:job.location,stage:'complete',dueDate:job.dueDate,
          notes:job.notes,links:job.links}};
    await api('/api/work-hub/jobs',payload); await refreshWork(); show();
    note(type === 'delete' ? 'Job removed.' : 'Job marked complete.');
  }
  async function saveProfile(form) {
    const name = String(new FormData(form).get('name') || '').trim();
    if (!name || name.length > 40) throw Error('Enter a display name up to 40 characters.');
    const version = state.account.versions && state.account.versions.profile || 0;
    const result = await api('/api/account/state',{key:'profile',value:{name},version});
    state.account.data.profile = {name};
    state.account.versions.profile = result.version;
    show(); note('Account display name saved.');
  }
  async function sendChat(form) {
    if (!state.chatReady) throw Error('Chat requires a verified secure AI connection.');
    if (state.chatPending) throw Error('Your previous message is still pending.');
    const message = String(new FormData(form).get('message') || '').trim();
    if (!message || message.length > 4000) throw Error('Write a message up to 4,000 characters.');
    state.chatPending = true; show();
    const requestId=crypto.randomUUID();
    try {
      const response = await api('/api/assistant/chat',{message,requestId},95000);
      if (response.ok !== true || response.requestId !== requestId) throw Error('Message result could not be verified.');
      await refreshChat(); show();
    } catch(error) {
      state.errors.chat = 'Delivery uncertain: ' + error.message;
      await refreshChat(); show();
      throw error;
    } finally { state.chatPending = false; show(); }
  }
  async function waitIce(pc) {
    if (pc.iceGatheringState === 'complete') return;
    await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',change);reject(Error('Voice negotiation timed out.'));},12000);
      function change(){if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',change);resolve();}}
      pc.addEventListener('icegatheringstatechange',change);
    });
  }
  async function closeLocalVoice() {
    if (state.voicePc) { try{state.voicePc.close();}catch{} }
    if (state.voiceStream) state.voiceStream.getTracks().forEach(t=>t.stop());
    if (state.voiceAudio) {state.voiceAudio.srcObject=null;state.voiceAudio.remove();}
    state.voicePc=null;state.voiceStream=null;state.voiceAudio=null;
  }
  async function startVoice() {
    if (!state.voiceReady || !isAuthed()) throw Error('A verified voice provider connection is required.');
    if (state.voiceRequestId || state.voiceState !== 'idle') throw Error('Reconcile the existing voice session first.');
    if (!document.getElementById('live-mic-consent')?.checked) throw Error('Confirm microphone access and usage before starting.');
    if (!navigator.mediaDevices || !window.RTCPeerConnection) throw Error('This browser does not support secure voice calls.');
    state.voiceState='connecting';show();
    const requestId=crypto.randomUUID();
    state.voiceRequestId=requestId;
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      const pc=new RTCPeerConnection();
      state.voiceStream=stream;state.voicePc=pc;
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      const audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.style.display='none';
      document.body.append(audio);state.voiceAudio=audio;
      pc.addEventListener('track', event=>{audio.srcObject=event.streams[0];audio.play().catch(()=>{});});
      await pc.setLocalDescription(await pc.createOffer({offerToReceiveAudio:true}));
      await waitIce(pc);
      const result=await api('/api/assistant/voice/start',{requestId,sdp:pc.localDescription.sdp},65000);
      if (result.ok!==true || result.state!=='ready' || !result.sdp || !result.configurationVerified)
        throw Error('The voice service did not confirm a ready session. Check its status.');
      state.voiceSessionId=result.sessionId;
      await pc.setRemoteDescription({type:'answer',sdp:result.sdp});
      state.voiceState='active';show();
    } catch(error) {
      await closeLocalVoice();
      state.voiceState='uncertain';state.errors.voice=error.message;show();
      throw error;
    }
  }
  async function checkVoice() {
    if (!state.voiceRequestId) { await refreshVoice();show();return; }
    const status=await api('/api/assistant/voice/status?requestId='+encodeURIComponent(state.voiceRequestId));
    if (status.finalized===true || ['rejected','closed'].includes(status.state)) {
      await closeLocalVoice();state.voiceRequestId=null;state.voiceSessionId=null;state.voiceState='idle';
      await refreshVoice();note('Previous voice request closed.');
    } else {
      state.voiceState='uncertain';
      note('The voice provider still reports an unresolved session. Do not start a duplicate.');
    }
    show();
  }
  async function endVoice() {
    if (!state.voiceRequestId) return;
    const payload={requestId:state.voiceRequestId};
    if (state.voiceSessionId) payload.sessionId=state.voiceSessionId;
    try {
      const result=await api('/api/assistant/voice/end',payload,30000);
      await closeLocalVoice();
      if (result.finalized===true || result.state==='closed') {
        state.voiceRequestId=null;state.voiceSessionId=null;state.voiceState='idle';
      } else state.voiceState='uncertain';
    } catch(error) {
      await closeLocalVoice();state.voiceState='uncertain';throw error;
    } finally {show();}
  }
  const existingPrivacy = renderer.privacy;
  renderer.home=homeLive;
  renderer.chat=chatLive;
  renderer.voice=voiceLive;
  renderer.video=videoLive;
  renderer.tasks=tasksLive;
  renderer.finished=finishedLive;
  renderer.ideas=ideaLive;
  renderer.opportunity=ideaLive;
  renderer.create=ideaLive;
  renderer.workspace=workspaceLive;
  renderer.contacts=workspaceLive;
  renderer.calendar=calendarLive;
  renderer.approvals=approvalsLive;
  renderer.revise=approvalsLive;
  renderer.onboarding=settingsLive;
  renderer.more=moreLive;
  renderer.customize=customizeLive;
  renderer.browser=workspaceLive;
  renderer.privacy = () => existingPrivacy().replace('Draft policy, not a published or lawyer-approved notice.',
    'Legal and privacy disclosures are under review. This page does not collect signatures.');
  document.addEventListener('click', async event=>{
    const target=event.target.closest('[data-live]');
    if (!target || target.disabled) return;
    event.preventDefault();
    if (state.saving && !['end-voice','check-voice'].includes(target.dataset.live)) return;
    const command=target.dataset.live;
    target.disabled=true;
    try {
      if (command==='retry' || command==='refresh') {
        if (command==='retry' || !isAuthed()) await start();
        else {await Promise.allSettled([refreshWork(),refreshChat(),refreshVoice(),refreshGoogle()]);show();}
      } else if (command==='start-voice') await startVoice();
      else if (command==='end-voice') await endVoice();
      else if (command==='check-voice') await checkVoice();
      else if (command.startsWith('finish-job:')) await updateJob('finish',command.slice(11));
      else if (command.startsWith('delete-job:')) await updateJob('delete',command.slice(11));
    } catch(error) {note(error.message);}
    finally {target.disabled=false;}
  });
  document.addEventListener('submit',async event=>{
    const forms={
      'live-chat-form':sendChat,
      'live-job-form':createJob,
      'live-idea-form':createIdea,
      'live-profile-form':saveProfile
    };
    const handler=forms[event.target.id];
    if (!handler) return;
    event.preventDefault();
    if (state.saving) return;
    state.saving=true;
    try { await handler(event.target); }
    catch(error) { note(error.message); if (error.status===409) {await refreshWork();show();} }
    finally {state.saving=false;}
  });
  window.addEventListener('beforeunload', () => {
    if (state.voiceStream) state.voiceStream.getTracks().forEach(track=>track.stop());
    if (state.voicePc) state.voicePc.close();
  });
  show();start();
})();

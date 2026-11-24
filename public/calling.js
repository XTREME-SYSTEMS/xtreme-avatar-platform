'use strict';
(() => {
  const account = window.XtremeAccount;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = selector => document.querySelector(selector);
  const pending = new Set();
  const terminal = new Set(['completed','busy','failed','no-answer','canceled','rejected','expired']);
  let session = null, requestId = null, requestFingerprint = null, generation = 0, busy = false;
  const newRequestId = () => crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2,'0')).join('');
  const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const phone = value => {
    if (window.XtremePhone?.normalize) return window.XtremePhone.normalize(value);
    // A partially cached app must stay strict until the shared normalizer loads.
    if (typeof value !== 'string' || !/^[+0-9 ().-]+$/.test(value)) return '';
    const number = value.replace(/[ ().-]/g, '');
    return /^\+[1-9][0-9]{7,14}$/.test(number) ? number : '';
  };
  const validPhone = value => /^\+[1-9][0-9]{7,14}$/.test(value);
  const notice = message => { const node = $('#call-notice'); if (node) node.textContent = message; };
  function show(html) {
    if (account.locked) return;
    $('#sheet-content').innerHTML = html;
    if (!$('#sheet').open) $('#sheet').showModal();
  }
  function errorText(error) {
    if (error.code === 'bridge_unlinked') return 'The existing calling service needs its private bridge token linked to this app. No call has been placed.';
    return error.message || 'The request could not be confirmed. Check status before trying again.';
  }
  async function api(action, args = {}, reviewToken) {
    if (account.locked || !account.user?.id) throw new Error('Sign in before using the call desk.');
    const identity = account.user.id, stamp = generation, controller = new AbortController();
    pending.add(controller);
    const timeout = setTimeout(() => controller.abort(), ['start','conference_dial_leg'].includes(action) ? 65000 : 20000);
    try {
      const response = await fetch('/api/communications', {
        method:'POST', credentials:'same-origin', cache:'no-store', signal:controller.signal,
        headers:{'Content-Type':'application/json','x-xtreme-account':identity},
        body:JSON.stringify({action,args,...(reviewToken ? {review_token:reviewToken} : {})})
      });
      if ([401,403].includes(response.status)) {
        account.invalidate('Your calling account permissions changed. Sign in again to continue.',response.status===401);
        throw new Error('Your account session ended.');
      }
      const result = await response.json();
      if (account.locked || stamp !== generation || account.user?.id !== identity) throw new Error('Your account changed.');
      if (!response.ok || !result.ok) {
        if (result.code === 'account_changed') account.invalidate('Your signed-in account changed. Reload to open the correct account.');
        throw Object.assign(new Error(result.error || 'The call service is unavailable.'), {code:result.code});
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The request was not confirmed. Check this call’s status before retrying.');
      throw error;
    } finally { clearTimeout(timeout); pending.delete(controller); }
  }
  function owner() {
    if (account.user?.role === 'owner') return true;
    show('<h2>Call desk</h2><p>This shared calling line is available to the account owner. Personal calling accounts are not connected yet.</p>');
    return false;
  }
  function form(kind, number = '') {
    if (busy) {const node=$('#call-error');if(node)node.textContent='A call request is pending. Wait for it to finish, then open Call status.';return;}
    if (!owner()) return;
    if (session && !finished()) { renderSession('',true); return; }
    session = null; requestId = newRequestId(); requestFingerprint = null;
    const conference = kind === 'conference';
    show(`<h2>${conference ? '3-way call' : 'Have AI Assist call'}</h2>
      <p>${conference ? 'You and two guests. This conference currently has no AI participant or recording.' : 'Review who AI Assist should call and what you need handled.'}</p>
      <form id="call-prepare-form" data-kind="${kind}">
      ${conference ? '<label class="field">First guest<input name="guest1" type="tel" inputmode="tel" maxlength="24" aria-describedby="call-number-hint" placeholder="202 555 0198" required></label><label class="field">Second guest<input name="guest2" type="tel" inputmode="tel" maxlength="24" aria-describedby="call-number-hint" placeholder="202 555 0124" required></label>' : `<label class="field">Phone number<input name="to" type="tel" inputmode="tel" maxlength="24" aria-describedby="call-number-hint" value="${escape(number)}" placeholder="202 555 0198" required></label>`}
      <p id="call-number-hint" class="helper">Default country code +1 (US/Canada). For other countries, enter + and the country code.</p>
      <label class="field">Purpose<input name="purpose" maxlength="320" placeholder="What should this call accomplish?" required></label>
      ${conference ? `<label class="field">Your time zone<input name="operator_timezone" value="${escape(zone())}" maxlength="80" required></label><label class="field">First guest’s time zone<input name="zone1" value="${escape(zone())}" maxlength="80" required></label><label class="field">Second guest’s time zone<input name="zone2" value="${escape(zone())}" maxlength="80" required></label>` : `<label class="field">Recipient’s time zone<input name="recipient_timezone" value="${escape(zone())}" maxlength="80" required></label>`}
      <button class="gold-button wide" type="submit">Review call</button>
      <p class="helper">Reviewing does not dial. Calls use the existing line and its usage limits.</p>
      <p id="call-notice" class="error" role="status"></p></form>
      <button class="text-button" data-call="readiness">Check connection</button>`);
  }
  function finished() {
    return session?.kind === 'conference' ? session.data.ended === true : session && terminal.has(session.data.state);
  }
  function renderSession(message = '', reveal = false) {
    if (!session || account.locked) return;
    if (!reveal && !$('#sheet').open) return;
    const {kind,data} = session, conference = kind === 'conference';
    const active = conference ? !data.ended : !terminal.has(data.state);
    const prepared = !conference && data.state === 'prepared';
    const next = conference && !data.ended && !data.stop_requested && !data.requires_reconciliation ? data.steps.find(s => s.state === 'planned') : null;
    show(`<h2>${conference ? '3-way call' : prepared ? 'Review your call' : 'Your call'}</h2>
      <div class="call-review"><strong>${conference ? 'You + two guests' : escape(data.to)}</strong><span>${escape(data.purpose)}</span></div>
      ${conference ? `<p class="helper">Human conference · no AI participant or recording</p>${data.steps.map(s => `<div class="conference-leg"><strong>${s.step === 1 ? 'You' : 'Guest '+(s.step-1)} · ${escape(s.to)}</strong><span>${escape(s.state.replaceAll('-',' '))}${s.joined_room ? ' · joined' : ''}</span></div>`).join('')}` : `<p class="call-status">${prepared ? 'Ready for your confirmation. No call has been placed.' : escape(data.state.replaceAll('-',' '))}${data.stop_requested ? ' · stop requested' : ''}</p>`}
      ${!conference && terminal.has(data.state) && data.end_reason === 'recipient_consent_timeout' ? '<p class="helper" role="status">The call ended because permission to continue was not confirmed within 30 seconds. On a new call, answer the opening question clearly and allow a brief pause.</p>' : !conference && terminal.has(data.state) && data.end_reason === 'recipient_declined' ? '<p class="helper" role="status">The call ended after the assistant detected a request not to continue.</p>' : ''}
      ${prepared || next ? `<form id="call-confirm-form" data-step="${next?.step || ''}"><p class="helper">${next ? 'Next: '+escape(next.to)+'. Participants are called one at a time.' : 'This is an AI assistant call. The opening asks whether the recipient has time to continue.'}</p><label class="consent-check"><input name="consent" type="checkbox" required><span>${next ? 'This participant' : 'This recipient'} has agreed to receive this ${conference ? 'conference' : 'AI'} call.</span></label><label class="consent-check"><input name="charges" type="checkbox" required><span>I approve provider charges for this call${conference ? ' leg' : ''}, within the existing limits.</span></label><button class="gold-button wide" type="submit">${conference ? 'Call '+(next.step === 1 ? 'me' : 'guest '+(next.step-1)) : 'Start call'}</button></form>` : ''}
      <p id="call-notice" class="error" role="status">${escape(message || (data.requires_reconciliation || data.recovery ? 'Check status before any further action. Do not redial.' : ''))}</p>
      <div class="call-actions"><button class="silver-button" data-call="status">Refresh status</button>${active ? '<button class="dark-button" data-call="end">End call</button>' : '<button class="gold-button" data-call="new">New call</button>'}</div>
      <p class="helper">Keep this app open while calling. Closing this panel does not hang up.</p>`);
  }
  async function readiness() {
    const stamp = generation;
    notice('Checking the existing calling service…');
    try {
      const {data} = await api('readiness');
      if (account.locked || generation !== stamp) return;
      const ready = data.modes.eden_speaks.configuration_missing.length === 0;
      notice(`${ready ? 'AI calling is configured' : 'AI calling needs setup'}. ${data.daily_call_remaining_utc ?? 'Unknown'} calls remain today. ${data.extensions.three_way.configured ? '3-way calling is configured.' : '3-way calling still needs operator setup and sufficient daily capacity.'}`);
    } catch (error) { if (!account.locked && generation === stamp) notice(errorText(error)); }
  }
  async function recover() {
    if (busy || !owner()) return;
    if (session) {renderSession('',true);return;}
    show('<h2>Call status</h2><p>Checking your last call…</p><p id="call-notice" class="error" role="status"></p>');
    await run(async () => {
      const result = await api('resume');
      if (!result.data || !result.kind || !result.review_token) {
        if ($('#sheet').open) show('<h2>Call status</h2><p>No previous call was found in this account.</p><button class="gold-button wide" data-call="new">Prepare a call</button>');
        return;
      }
      session = {kind:result.kind,data:result.data,token:result.review_token};
      if (result.recovery_pending) {
        if (session.kind === 'conference') session.data.requires_reconciliation = true;
        else session.data.state = 'uncertain';
      }
      renderSession(result.recovery_pending ? 'A previous request may still be processing. Refresh status before taking another action.' : 'Recovered your last call. Refresh status for the latest update.');
    });
  }
  async function run(task) {
    if (busy || account.locked) return;
    busy = true; const stamp = generation;
    $('#sheet-content')?.querySelectorAll('button').forEach(button => {button.disabled = true;});
    try { await task(); }
    catch (error) { if (!account.locked && stamp === generation) notice(errorText(error)); }
    finally {
      if (stamp === generation) {busy = false; $('#sheet-content')?.querySelectorAll('button').forEach(button => {button.disabled = false;});}
    }
  }
  document.addEventListener('submit', event => {
    if (!['call-prepare-form','call-confirm-form'].includes(event.target.id)) return;
    event.preventDefault(); if (account.locked || busy) return;
    const formElement = event.target, values = new FormData(formElement);
    if (formElement.id === 'call-prepare-form') {
      const kind = formElement.dataset.kind;
      const purpose = String(values.get('purpose') || '').trim();
      if (!purpose) {notice('Enter the purpose of this call.');return;}
      const args = kind === 'conference'
        ? {request_id:requestId,purpose,operator_timezone:values.get('operator_timezone'),recipients:[{to:phone(values.get('guest1')),recipient_timezone:values.get('zone1')},{to:phone(values.get('guest2')),recipient_timezone:values.get('zone2')}]}
        : {request_id:requestId,to:phone(values.get('to')),purpose,mode:'eden_speaks',recipient_timezone:values.get('recipient_timezone')};
      if (kind === 'conference' ? args.recipients.some(r => !validPhone(r.to)) : !validPhone(args.to)) {notice('Enter a 10-digit US/Canada number, or use + and the country code for another country.');return;}
      if (kind === 'conference' && args.recipients[0].to === args.recipients[1].to) {notice('Enter two different guest phone numbers.');return;}
      const fingerprint = JSON.stringify({...args,request_id:undefined});
      if (requestFingerprint && requestFingerprint !== fingerprint) {requestId = newRequestId();args.request_id = requestId;}
      requestFingerprint = fingerprint;
      void run(async () => {
        notice('Preparing your review. No call is being placed…');
        const result = await api(kind === 'conference' ? 'conference_prepare' : 'prepare',args);
        session = {kind,data:result.data,token:result.review_token}; renderSession();
      });
    } else if (session && values.get('consent') && values.get('charges')) {
      const conference = session.kind === 'conference', data = session.data;
      const step = conference ? data.steps.find(s => s.step === Number(formElement.dataset.step)) : null;
      if (conference && !step) return;
      const args = { [conference ? 'conference_id' : 'call_id']:data[conference ? 'conference_id' : 'call_id'],confirm_to:conference ? step.to : data.to,confirm_purpose:data.purpose,recipient_consented:true,approve_charges:true,...(conference ? {step:step.step} : {})};
      void run(async () => {
        if (conference) {step.state = 'submitting';session.data.requires_reconciliation = true;}
        else {session.data.state = 'submitting';}
        renderSession('Submitting the reviewed call. Check status if the connection is interrupted.');
        try {
          const result = await api(conference ? 'conference_dial_leg' : 'start',args,session.token);
          session.data = result.data;
          if (result.recovery_pending) {if (conference) session.data.requires_reconciliation = true;else session.data.state = 'uncertain';}
          renderSession(result.recovery_pending ? 'The call response arrived, but recovery is still pending. Refresh status before another action.' : '');
        } catch(error) {
          if (account.locked || !session) return;
          // A lost response may still mean the provider dialed. Never automatically retry.
          if (conference) {session.data.requires_reconciliation = true;} else {session.data.state = 'uncertain';}
          renderSession(errorText(error));
        }
      });
    }
  });
  document.addEventListener('click', event => {
    if (account.locked) return;
    const action = event.target.closest('[data-call]')?.dataset.call;
    if (!action) return;
    if (action === 'conference') {form('conference');return;}
    if (action === 'resume') {void recover();return;}
    if (action === 'new') {form('call');return;}
    if (action === 'readiness') {void run(readiness);return;}
    if (session && ['status','end'].includes(action)) void run(async () => {
      const conference = session.kind === 'conference', key = conference ? 'conference_id' : 'call_id';
      const result = await api(conference ? (action === 'end' ? 'conference_end' : 'conference_status') : (action === 'end' ? 'hangup' : 'status'),{[key]:session.data[key]},session.token);
      session.data = result.data;
      if (result.recovery_pending) {if (conference) session.data.requires_reconciliation = true;else session.data.state = 'uncertain';}
      renderSession(result.recovery_pending ? 'Recovery is still pending. Refresh status before another action.' : '');
    });
  });
  window.addEventListener('beforeunload', event => {if(session && !finished() && (session.kind === 'conference' ? (session.data.requires_reconciliation || session.data.steps.some(s=>s.state!=='planned')) : session.data.state!=='prepared')){event.preventDefault();event.returnValue='';}});
  window.addEventListener('xtreme:account-ended', () => {generation++;busy=false;for(const controller of pending)controller.abort();pending.clear();session=null;requestId=null;requestFingerprint=null;});
  window.XtremeCalling = Object.freeze({reviewNumber:number => form('call',number)});
})();

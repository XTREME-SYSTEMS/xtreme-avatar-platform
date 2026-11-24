/* Private request capture only. This module does not run AI or contact providers. */
(() => {
  'use strict';
  const account = window.XtremeAccount;
  const ownerId = account?.user?.id;
  const TYPE = 'xtreme-work-request', KIND = 'Executive request', MAX_TEXT = 4000;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = selector => document.querySelector(selector);
  const templates = { meeting: 'Prepare a meeting\n\nMeeting:\nGoal:\nWhat I need ready:', followup: 'Follow up\n\nWith:\nAbout:\nNext step:', idea: 'Capture an idea\n\nThe idea:\nWhy it matters:\nNext step:', note: 'Quick note\n\nNotes:\nNext step:', leadbrief: 'Construction lead search\n\nTrade / services:\nCity or service area:\nProject types:\nMinimum job size:\nPublic sources to check:\nNext step:', jobbrief: 'Job briefing\n\nJobsite / project:\nScope:\nCrew and equipment:\nMaterials needed:\nDecisions / next steps:', bidfollowup: 'Bid follow-up\n\nClient / project:\nProposal or scope:\nOutstanding questions:\nNext step:', sitenote: 'Site note\n\nJobsite / project:\nObservation:\nAction needed:\nOwner / due date:' };
  function templateText(key, number) {
    if (!Object.hasOwn(templates, key)) return null;
    // Phone context is bounded plain text, never a dial target or executable instruction.
    const normalized = typeof number === 'string' && number.length <= 40 ? number.replace(/[\s().-]/g, '') : '';
    const context = /^\+?[0-9]{7,15}$/.test(normalized) ? normalized : '';
    if (context && ['followup', 'note', 'bidfollowup', 'sitenote'].includes(key)) return templates[key].replace('\n\n', `\n\nPhone: ${context}\n`);
    return templates[key];
  }
  let plans = account?.read('plans', []) || [], composer = '', editingId = null, status = '', busy = false, generation = 0;
  if (!Array.isArray(plans)) plans = [];
  function active() {
    if (!account || account.locked || !ownerId) return false;
    if (account.user?.id !== ownerId) { account.invalidate?.('Your signed-in account changed. Reload to open the correct account.'); return false; }
    return true;
  }
  function envelope(plan) {
    if (plan?.kind !== KIND || typeof plan.details !== 'string') return null;
    try {
      const value = JSON.parse(plan.details);
      return value.type === TYPE && value.version === 1 && typeof value.text === 'string' && ['draft', 'done'].includes(value.status) ? value : null;
    } catch { return null; }
  }
  function changed() { if (active()) window.dispatchEvent(new Event('xtreme:work-changed')); }
  function hasUnsaved() { return Boolean(active() && (busy || composer.trim())); }
  function renderHome() {
    if (!active()) return '';
    const requests = plans.filter(plan => envelope(plan));
    const legacy = plans.filter(plan => !envelope(plan));
    const done = requests.filter(plan => envelope(plan).status === 'done').length;
    return `<section class="assist-workspace" aria-label="Your private tasks"><form id="assist-request-form" class="assist-composer"><label for="assist-request-text">${editingId ? 'Edit your task' : 'What do you need handled?'}</label><textarea id="assist-request-text" name="request" rows="4" maxlength="${MAX_TEXT}" placeholder="Write a job briefing, bid follow-up, or site note…" ${busy ? 'readonly' : ''}>${esc(composer)}</textarea><div class="assist-chips" aria-label="Request starters">${[['jobbrief','Job briefing'],['bidfollowup','Bid follow-up'],['sitenote','Site note']].map(([key,label]) => `<button type="button" data-work="template" data-template="${key}" ${busy ? 'disabled' : ''}>${label}</button>`).join('')}</div><div class="assist-composer-actions"><button class="gold-button" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Saving…' : editingId ? 'Save changes' : 'Save task'}</button>${editingId ? `<button class="text-button" type="button" data-work="cancel-edit" ${busy ? 'disabled' : ''}>Cancel edit</button>` : ''}</div><p class="assist-status" id="assist-work-status" role="status" aria-live="polite">${esc(status)}</p><p class="assist-note">Private task drafts · Assistant execution not connected.</p></form><section class="assist-brief" aria-label="Saved tasks"><div class="assist-brief-heading"><h2>Your tasks</h2><div class="assist-counts"><span>${requests.length - done} draft${requests.length - done === 1 ? '' : 's'}</span><span>${done} done</span></div></div>${requests.length ? `<div class="assist-list">${[...requests].reverse().map(plan => { const item = envelope(plan); return `<button type="button" class="assist-request" data-work="open" data-id="${esc(plan.id)}" ${busy ? 'disabled' : ''}><span class="assist-request-status">${item.status === 'done' ? 'Marked done by you' : 'Draft'}</span><strong>${esc(item.text.split('\n')[0].slice(0,90) || 'Saved request')}</strong><span class="assist-request-preview">${esc(item.text.includes('\n') ? item.text.split('\n').slice(1).join('\n').trim().slice(0,150) : item.text.slice(90,240))}</span><span class="assist-request-link">Review task</span></button>`; }).join('')}</div>` : '<p class="assist-empty">Your saved tasks will appear here.</p>'}${legacy.length ? `<details class="assist-legacy"><summary>Earlier saved items (${legacy.length})</summary><p>Kept in their original format.</p>${legacy.map(plan => `<button type="button" class="assist-request" data-work="open" data-id="${esc(plan.id)}" ${busy ? 'disabled' : ''}>${esc(plan.kind || 'Saved item')} · Review</button>`).join('')}</details>` : ''}</section></section>`;
  }
  function focusComposer() { const input = $('#assist-request-text'); if (input) { input.value = composer; input.focus(); } }
  function detail(id, confirmDelete = false) {
    if (!active() || busy) return;
    const plan = plans.find(item => item.id === id); if (!plan) return;
    const sheet = $('#sheet'), content = $('#sheet-content'); if (!sheet || !content) return;
    const other = document.querySelector('dialog[open]');
    if (other && (other !== sheet || !$('#assist-detail'))) return;
    const item = envelope(plan);
    content.innerHTML = `<section id="assist-detail" data-id="${esc(id)}"><h2>${item ? 'Saved task' : esc(plan.kind || 'Earlier saved item')}</h2><p>${item ? item.status === 'done' ? 'Marked done by you.' : 'Draft · saved for review.' : 'This earlier item is preserved in its original format.'}</p><label for="assist-detail-text" class="assist-detail-label">${item ? 'Your task' : 'Saved content'}</label><textarea id="assist-detail-text" class="assist-detail-text" readonly rows="8">${esc(item ? item.text : plan.details)}</textarea><button class="silver-button" type="button" data-work="copy" data-id="${esc(id)}">Copy text</button><p id="assist-detail-status" class="assist-status" role="status"></p>${item ? confirmDelete ? `<p>Delete this saved task?</p><div class="assist-detail-actions"><button class="dark-button" type="button" data-work="delete" data-id="${esc(id)}">Delete task</button><button class="silver-button" type="button" data-work="open" data-id="${esc(id)}">Keep task</button></div>` : `<div class="assist-detail-actions"><button class="gold-button" type="button" data-work="edit" data-id="${esc(id)}">Edit task</button><button class="silver-button" type="button" data-work="toggle" data-id="${esc(id)}">${item.status === 'done' ? 'Move to drafts' : 'Mark done'}</button><button class="text-button" type="button" data-work="ask-delete" data-id="${esc(id)}">Delete task</button></div><p class="assist-note">These controls update your saved task. They do not execute it.</p>` : ''}</section>`;
    if (!sheet.open) sheet.showModal();
  }
  function detailNotice(message) { const node = $('#assist-detail-status'); if (node) node.textContent = message; }
  async function copyRequest(id) {
    const plan = plans.find(item => item.id === id); if (!plan || !active()) return;
    const stamp = generation;
    try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(envelope(plan)?.text ?? plan.details); if (stamp === generation && active()) detailNotice('Request text copied.'); }
    catch { if (stamp === generation && active()) detailNotice('Copy is unavailable here. Select the saved text to copy it.'); }
  }
  function closeDetail() { if ($('#assist-detail')) { $('#sheet')?.close(); $('#sheet-content')?.replaceChildren(); } }
  function validSize(next) { return next.length <= 30 && next.every(plan => typeof plan.details === 'string' && plan.details.length <= 10000) && JSON.stringify(next).length <= 120000 && new TextEncoder().encode(JSON.stringify(next)).byteLength <= 125000; }
  async function commit(next, message, onSuccess = () => {}) {
    if (!active() || busy) return false;
    if (!validSize(next)) { status = next.length > 30 ? 'Your account has 30 saved items. Delete a request before adding another.' : 'This request is too large to save. Shorten it and try again.'; detailNotice(status); changed(); return false; }
    busy = true; const stamp = generation;
    status = 'Saving…'; detailNotice(status); changed();
    $('#assist-detail')?.querySelectorAll('button').forEach(button => { button.disabled = true; });
    let ok = false;
    try { ok = await account.save('plans', structuredClone(next)); } catch { ok = false; }
    if (stamp !== generation || !active()) return false;
    busy = false;
    if (ok) { plans = structuredClone(next); status = message; onSuccess(); }
    else { status = 'Not saved. Keep your text on this page, then reload before trying again.'; detailNotice(status); $('#assist-detail')?.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
    changed();
    return Boolean(ok);
  }
  async function saveComposer() {
    if (!active() || busy) return;
    const text = composer.trim();
    if (!text || text.length > MAX_TEXT) { status = !text ? 'Write a request first.' : `Keep the request within ${MAX_TEXT} characters.`; changed(); focusComposer(); return; }
    const existing = editingId ? plans.find(plan => plan.id === editingId) : null;
    const previous = existing && envelope(existing);
    if (editingId && !previous) { status = 'This request is no longer available. Reload before editing.'; changed(); return; }
    const details = JSON.stringify({ type: TYPE, version: 1, text, status: previous?.status || 'draft' });
    const id = existing?.id || `work_${crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2,'0')).join('')}`;
    const plan = existing ? { ...existing, details } : { id, kind: KIND, details, created: new Date().toISOString(), numbers: [] };
    const next = existing ? plans.map(item => item.id === id ? plan : item) : [...plans, plan];
    await commit(next, existing ? 'Changes saved.' : 'Task saved for your review.', () => { composer = ''; editingId = null; });
  }
  document.addEventListener('input', event => {
    if (event.target.id !== 'assist-request-text' || !active() || busy) return;
    composer = event.target.value; status = composer ? 'Not saved yet.' : '';
    const node = $('#assist-work-status'); if (node) node.textContent = status;
  });
  document.addEventListener('submit', event => { if (event.target.id !== 'assist-request-form') return; event.preventDefault(); void saveComposer(); });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-work]'); if (!button || !active() || busy) return;
    event.preventDefault(); const action = button.dataset.work, id = button.dataset.id;
    if (action === 'template') {
      const text = templateText(button.dataset.template, button.dataset.number); if (text === null) return;
      const next = composer.trim() ? `${composer}\n\n${text}` : text;
      if (next.length > MAX_TEXT) { status = 'This draft is full. Save it or shorten it before adding a starter.'; changed(); focusComposer(); return; }
      composer = next; status = 'Not saved yet.'; changed(); focusComposer(); return;
    }
    if (action === 'cancel-edit') { composer = ''; editingId = null; status = ''; changed(); return; }
    if (action === 'open' || action === 'ask-delete') { detail(id, action === 'ask-delete'); return; }
    if (action === 'copy') { void copyRequest(id); return; }
    const plan = plans.find(item => item.id === id), item = plan && envelope(plan); if (!item) return;
    if (action === 'edit') { if (composer.trim() && (editingId !== id || composer !== item.text)) { status = 'Save or clear your current draft before editing another request.'; detailNotice(status); changed(); return; } composer = item.text; editingId = id; status = 'Editing saved request.'; closeDetail(); changed(); focusComposer(); return; }
    if (action === 'toggle') { const details = JSON.stringify({ ...item, status: item.status === 'done' ? 'draft' : 'done' }); void commit(plans.map(entry => entry.id === id ? { ...entry, details } : entry), item.status === 'done' ? 'Moved to drafts.' : 'Marked done by you.', closeDetail); }
    if (action === 'delete') void commit(plans.filter(entry => entry.id !== id), 'Request deleted.', () => { if (editingId === id) { editingId = null; composer = ''; } closeDetail(); });
  });
  window.addEventListener('beforeunload', event => { if (hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('xtreme:account-ended', () => { generation++; plans = []; composer = ''; editingId = null; status = ''; busy = false; closeDetail(); const input = $('#assist-request-text'); if (input) input.value = ''; });
  window.XtremeWork = Object.freeze({ renderHome, hasUnsaved });
  window.dispatchEvent(new Event('xtreme:work-ready'));
})();

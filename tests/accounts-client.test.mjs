import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/accounts.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

async function harness(handler = () => reply({ saved: true, version: 1 }), { confirmResult = true, unsavedWorkspace = false } = {}) {
  const nodes = new Map(), handlers = new Map(), windowHandlers = new Map(), timers = new Map();
  let timerId = 0, dialogsCreated = 0, confirmations = 0, cleanups = 0;
  const calls = [], navigations = [], scripts = [];
  function element(tag = 'div') {
    return {
      tag, id: '', innerHTML: '', textContent: '', open: false, removed: false,
      classList: { add() {} },
      replaceChildren() { this.innerHTML = ''; this.textContent = ''; },
      remove() { this.removed = true; nodes.delete('#' + this.id); },
      close() { this.open = false; },
      showModal() { this.open = true; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  }
  for (const id of ['main', 'bottom-nav', 'sheet-content', 'toast', 'sheet', 'account-sheet']) {
    const el = element(id.includes('sheet') && id !== 'sheet-content' ? 'dialog' : 'div');
    el.id = id;
    el.innerHTML = id.includes('sheet') ? 'PRIVATE ACCOUNT A CONTENT' : '';
    el.open = el.tag === 'dialog';
    nodes.set('#' + id, el);
  }
  const originalRoster = nodes.get('#account-sheet');
  const document = {
    visibilityState: 'visible',
    querySelector: selector => nodes.get(selector) || null,
    querySelectorAll: selector => selector === 'dialog[open]' ? [...nodes.values()].filter(n => n.tag === 'dialog' && n.open) : [],
    createElement(tag) { if (tag === 'dialog') dialogsCreated++; return element(tag); },
    body: { inert: false, append(el) { if (el.tag === 'script') scripts.push(el); if (el.id) nodes.set('#' + el.id, el); } },
    addEventListener(type, fn) { handlers.set(type, [...(handlers.get(type) || []), fn]); },
  };
  const window = {
    XtremeWork: { hasUnsaved: () => unsavedWorkspace },
    addEventListener(type, fn) { windowHandlers.set(type, [...(windowHandlers.get(type) || []), fn]); },
    dispatchEvent(event) {
      if (event.type === 'xtreme:account-ended') cleanups++;
      for (const fn of windowHandlers.get(event.type) || []) fn(event);
      return true;
    },
  };
  const initial = {
    user: { id: 'account-a', email: 'owner@example.test', role: 'owner', status: 'active' },
    data: { draft: { to: '+15551234567', body: 'PRIVATE DRAFT A', channel: 'SMS' } },
    versions: { draft: 1 },
  };
  let first = true;
  const fetch = async (path, options) => {
    calls.push({ path, options });
    if (first) { first = false; return reply(initial); }
    return handler(path, options);
  };
  const context = vm.createContext({
    document, window, fetch, AbortController, Event, CustomEvent, structuredClone,
    location: { assign: url => navigations.push(url), reload() {} },
    confirm: () => { confirmations++; return confirmResult; },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context, { filename: 'accounts.js' });
  await tick();
  const action = async name => {
    const event = { preventDefault() {}, target: { closest: () => ({ dataset: { account: name } }) } };
    await Promise.all((handlers.get('click') || []).map(fn => fn(event)));
  };
  const expire = async ms => {
    for (const [id, timer] of [...timers]) {
      if (timer.ms === ms) { timers.delete(id); timer.fn(); }
    }
    await tick();
  };
  return { account: window.XtremeAccount, window, document, scripts, nodes, originalRoster, calls, navigations, action, expire,
    get cleanups() { return cleanups; }, get dialogsCreated() { return dialogsCreated; },
    get confirmations() { return confirmations; }, body: document.body, timers };
}

test('account_changed 409 immediately gates and clears private account UI/state', async () => {
  const h = await harness(() => reply({ error: 'Account changed.', code: 'account_changed' }, 409));
  assert.equal(h.account.user.id, 'account-a');
  assert.equal(h.account.read('draft', null).body, 'PRIVATE DRAFT A');
  assert.equal(await h.account.save('draft', { to: '', body: 'new private text', channel: 'SMS' }), false);
  assert.equal(h.account.locked, true);
  assert.equal(h.account.user, null);
  assert.equal(h.account.read('draft', null), null);
  assert.equal(h.nodes.get('#sheet-content').innerHTML, '');
  assert.equal(h.originalRoster.removed, true);
  assert.equal(h.nodes.get('#account-sheet'), undefined);
  assert.equal(h.nodes.get('#sheet').open, false);
  assert.equal(h.nodes.get('#bottom-nav').innerHTML, '');
  assert.equal(h.cleanups, 1);
});

test('late team response cannot reopen a roster after account gating', async () => {
  const roster = deferred();
  const h = await harness(path => path === '/api/team' ? roster.promise : reply({ error: 'Account changed.', code: 'account_changed' }, 409));
  const opening = h.action('team');
  await tick();
  const teamCall = h.calls.find(c => c.path === '/api/team');
  assert.ok(teamCall);
  await h.account.save('draft', { to: '', body: 'change', channel: 'SMS' });
  assert.equal(teamCall.options.signal.aborted, true);
  roster.resolve(reply({ members: [{ id: 'account-b', email: 'private-b@example.test', role: 'member', status: 'active' }], invitations: [] }));
  await opening;
  assert.equal(h.account.locked, true);
  assert.equal(h.dialogsCreated, 0);
  assert.equal(h.nodes.get('#account-sheet'), undefined);
  assert.ok(!h.nodes.get('#main').innerHTML.includes('private-b@example.test'));
});

test('hung saves abort at the 12 second request deadline and are not reported saved', async () => {
  const h = await harness((_path, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
  }));
  const saving = h.account.save('draft', { to: '', body: 'unsaved', channel: 'SMS' });
  await tick();
  assert.ok([...h.timers.values()].some(t => t.ms === 12000));
  await h.expire(12000);
  assert.equal(await saving, false);
  assert.equal(h.calls.at(-1).options.signal.aborted, true);
  assert.match(h.nodes.get('#toast').textContent, /not saved/);
});

test('signout offers discard at 8 seconds and aborts stalled saves after acceptance', async () => {
  const h = await harness((_path, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
  }));
  const saving = h.account.save('draft', { to: '', body: 'unsaved', channel: 'SMS' });
  await tick();
  const signingOut = h.action('signout');
  await tick();
  assert.ok([...h.timers.values()].some(t => t.ms === 8000));
  await h.expire(8000);
  await signingOut;
  assert.equal(await saving, false);
  assert.equal(h.confirmations, 1);
  assert.equal(h.account.locked, true);
  assert.equal(h.account.user, null);
  assert.equal(h.calls.at(-1).options.signal.aborted, true);
  assert.deepEqual(h.navigations, ['/signout-with-chatgpt?return_to=%2F']);
});

test('pending signout freezes edits and duplicate requests, then cancel restores editing', async () => {
  const firstSave = deferred();
  let writes = 0;
  const h = await harness(() => ++writes === 1 ? firstSave.promise : reply({ saved: true, version: 3 }), { confirmResult: false });
  const saving = h.account.save('draft', { to: '', body: 'pending draft', channel: 'SMS' });
  await tick();
  const signingOut = h.action('signout');
  assert.equal(h.body.inert, true);
  assert.equal(await h.account.save('draft', { to: '', body: 'must not enter queue', channel: 'SMS' }), false);
  assert.equal(h.account.read('draft', null).body, 'pending draft');
  await h.action('signout');
  assert.equal([...h.timers.values()].filter(t => t.ms === 8000).length, 1);
  assert.equal(writes, 1);
  await h.expire(8000);
  await signingOut;
  assert.equal(h.confirmations, 1);
  assert.equal(h.body.inert, false);
  assert.equal(h.account.locked, false);
  assert.equal(h.account.user.id, 'account-a');
  assert.deepEqual(h.navigations, []);
  assert.equal(h.calls.at(-1).options.signal.aborted, false);
  firstSave.resolve(reply({ saved: true, version: 2 }));
  assert.equal(await saving, true);
  assert.equal(await h.account.save('draft', { to: '', body: 'editing resumed', channel: 'SMS' }), true);
  assert.equal(writes, 2);
  assert.equal(h.account.read('draft', null).body, 'editing resumed');
});

test('an unsaved executive request can cancel signout without losing the account', async () => {
  const h = await harness(undefined, {confirmResult:false,unsavedWorkspace:true});
  await h.action('signout');
  assert.equal(h.confirmations,1);
  assert.equal(h.account.locked,false);
  assert.equal(h.account.user.id,'account-a');
  assert.equal(h.body.inert,false);
  assert.deepEqual(h.navigations,[]);
});

test('explicitly discarding an unsaved executive request allows signout', async () => {
  const h = await harness(undefined, {confirmResult:true,unsavedWorkspace:true});
  await h.action('signout');
  assert.equal(h.confirmations,1);
  assert.equal(h.account.locked,true);
  assert.equal(h.cleanups,1);
  assert.deepEqual(h.navigations,['/signout-with-chatgpt?return_to=%2F']);
});

test('video module slow loading never duplicates a script and errors permit a single retry', async () => {
  const h = await harness();
  const app = h.scripts[0];
  app.onload(); app.onload();
  const videos = () => h.scripts.filter(s => s.src.startsWith('/tavus-layer.js'));
  assert.equal(videos().length, 1);
  assert.equal(h.window.XtremeVideoModule.state, 'loading');
  assert.equal(h.window.XtremeVideoModule.retry(), false);
  await h.expire(12000);
  assert.equal(h.window.XtremeVideoModule.state, 'slow');
  assert.equal(h.window.XtremeVideoModule.retry(), false);
  assert.equal(videos().length, 1);
  const first = videos()[0], staleLoad = first.onload;
  first.onerror();
  assert.equal(first.removed, true);
  assert.equal(h.window.XtremeVideoModule.state, 'error');
  assert.equal(h.window.XtremeVideoModule.retry(), true);
  assert.equal(h.window.XtremeVideoModule.retry(), false);
  assert.equal(videos().length, 2);
  staleLoad();
  assert.equal(h.window.XtremeVideoModule.state, 'loading');
  videos()[1].onload();
  assert.equal(h.window.XtremeVideoModule.state, 'ready');
  assert.equal(h.window.XtremeVideoModule.retry(), false);
  videos()[1].onerror();
  assert.equal(h.window.XtremeVideoModule.state, 'ready');
});

test('account teardown prevents late video load callbacks, retry, and app module mounting', async () => {
  for (const started of [false, true]) {
    const h = await harness();
    const app = h.scripts[0];
    if (started) app.onload();
    const video = h.scripts.find(s => s.src.startsWith('/tavus-layer.js'));
    const lateLoad = video?.onload, lateError = video?.onerror;
    const before = h.scripts.length;
    h.account.invalidate('Account ended.');
    lateLoad?.(); lateError?.(); app.onload();
    assert.equal(h.window.XtremeVideoModule.state, 'stopped');
    assert.equal(h.window.XtremeVideoModule.retry(), false);
    assert.equal(h.scripts.length, before);
    if (video) assert.equal(video.removed, true);
  }
});

test('avatar cache changes only after a successful save and preserves its previous value on failure', async () => {
  const result = deferred();
  let writes = 0;
  const h = await harness(() => ++writes === 1 ? result.promise : reply({ error: 'Unavailable' }, 503));
  const first = h.account.save('model', 'daniel');
  assert.equal(h.account.read('model', 'eden'), 'eden');
  result.resolve(reply({ saved: true, version: 1 }));
  assert.equal(await first, true);
  assert.equal(h.account.read('model', 'eden'), 'daniel');
  assert.equal(await h.account.save('model', 'gloria'), false);
  assert.equal(h.account.read('model', 'eden'), 'daniel');
});

test('late avatar save success cannot restore state after the account ends', async () => {
  const result = deferred(), h = await harness(() => result.promise);
  const saving = h.account.save('model', 'gloria');
  await tick();
  h.account.invalidate('Account changed.');
  result.resolve(reply({ saved: true, version: 1 }));
  assert.equal(await saving, false);
  assert.equal(h.account.read('model', null), null);
});


test('media context distinguishes inherited policy blocks, allowed frames, and unknown policy', async () => {
  const h = await harness(); h.window.self = h.window; h.window.top = {};
  h.document.permissionsPolicy = { allowsFeature: feature => feature === 'camera' };
  assert.equal(h.window.XtremeMediaContext.read().microphone, false);
  assert.equal(h.window.XtremeMediaContext.read().camera, true);
  assert.equal(h.window.XtremeMediaContext.read().framed, true);
  h.document.permissionsPolicy = { allowsFeature: () => true };
  assert.equal(h.window.XtremeMediaContext.read().microphone, true);
  delete h.document.permissionsPolicy;
  h.document.featurePolicy = { allowsFeature: () => false };
  assert.equal(h.window.XtremeMediaContext.read().microphone, false);
  h.document.featurePolicy = { allowsFeature() { throw new Error('Unavailable'); } };
  assert.equal(h.window.XtremeMediaContext.read().microphone, null);
  delete h.document.featurePolicy; h.window.top = h.window;
  assert.equal(h.window.XtremeMediaContext.read().microphone, null);
  assert.equal(h.window.XtremeMediaContext.read().framed, false);
  assert.equal(h.window.XtremeMediaContext.read().publishedUrl, 'https://xtreme-avatar-mobile.strategic-ai.chatgpt.site/');
});

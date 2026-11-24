import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATARS, SKILLS } from '../public/assistant-catalog.mjs';

let run = 0;
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function harness({ initial = {}, save = async () => true } = {}) {
  const docHandlers = new Map(), winHandlers = new Map(), saves = [], events = [];
  const nodes = new Map();
  const node = (id = '') => ({ id, innerHTML: '', value: '', checked: false, focus() {}, replaceChildren() { this.innerHTML = ''; } });
  nodes.set('#assistant-avatar-results', node('assistant-avatar-results'));
  nodes.set('.assistant-settings', node());
  const data = structuredClone(initial);
  const account = { user: { id: 'member-a' }, locked: false, read: (key, fallback) => structuredClone(data[key] ?? fallback), async save(key, value) { saves.push({ key, value: structuredClone(value) }); const result = await save(key, value); if (result) data[key] = structuredClone(value); return result; } };
  const window = { XtremeAccount: account, addEventListener(type, listener) { winHandlers.set(type, [...(winHandlers.get(type) || []), listener]); }, dispatchEvent(event) { events.push(event); for (const listener of winHandlers.get(event.type) || []) listener(event); return true; } };
  const document = { addEventListener(type, listener) { docHandlers.set(type, [...(docHandlers.get(type) || []), listener]); }, querySelector(selector) { return nodes.get(selector) || null; } };
  const location = { hash: '#models' };
  globalThis.window = window; globalThis.document = document; globalThis.location = location;
  await import(`../public/assistant-settings.js?test=${++run}`);
  function target(attribute, value, extra = {}) {
    const key = attribute.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return { dataset: { [key]: value }, ...extra, closest(selector) { return selector === '['+attribute+']' ? this : null; } };
  }
  async function dispatch(type, target) { await Promise.all((docHandlers.get(type) || []).map(listener => listener({ type, target, preventDefault() {} }))); await tick(); }
  function end() { account.locked = true; account.user = null; window.dispatchEvent(new Event('xtreme:account-ended')); }
  return { account, window, document, location, saves, events, nodes, target, dispatch, end, render: () => window.XtremeAssistantSettings.render() };
}

test('collection shows every persona, descriptions and truthful chat scope', async () => {
  const h = await harness(); const html = h.render();
  assert.equal(AVATARS.length, 24);
  for (const avatar of AVATARS) { assert.ok(html.includes(`data-assistant-avatar="${avatar.id}"`)); assert.ok(html.includes(avatar.name)); }
  assert.match(html, /Names and personalities apply to AI chat/);
  assert.match(html, /Live video and voice keep the existing company assistant/);
  assert.match(html, /data-assistant-avatar="eden" aria-pressed="true"/);
  assert.equal(h.saves.length, 0);
});

test('avatar choice commits only after acknowledgement and duplicate clicks are blocked across navigation', async () => {
  const waiting = deferred(); const h = await harness({ initial: { model: 'daniel' }, save: () => waiting.promise });
  const saving = h.dispatch('click', h.target('data-assistant-avatar', 'maya'));
  assert.match(h.render(), /data-assistant-avatar="daniel" aria-pressed="true"/);
  assert.match(h.render(), /Saving your preference/);
  h.location.hash = '#home'; h.location.hash = '#models';
  await h.dispatch('click', h.target('data-assistant-avatar', 'raj'));
  assert.equal(h.saves.length, 1);
  waiting.resolve(true); await saving;
  assert.match(h.render(), /data-assistant-avatar="maya" aria-pressed="true"/);
  assert.match(h.render(), /Saved. Applies to your next chat message/);
});

test('failed and thrown saves preserve confirmed persona and require recovery before replay', async () => {
  for (const save of [async () => false, async () => { throw new Error('Offline'); }]) {
    const h = await harness({ initial: { model: 'gloria' }, save });
    await h.dispatch('click', h.target('data-assistant-avatar', 'nova'));
    assert.match(h.render(), /data-assistant-avatar="gloria" aria-pressed="true"/);
    assert.match(h.render(), /Not saved. Your previous selection remains active/);
    assert.match(h.render(), /data-account="reload"/);
    await h.dispatch('click', h.target('data-assistant-avatar', 'raj'));
    assert.equal(h.saves.length, 1);
  }
});

test('autonomy and skills save allowed private preferences while unavailable actions stay disabled', async () => {
  const h = await harness();
  await h.dispatch('click', h.target('data-assistant-tab', 'autonomy'));
  assert.match(h.render(), /data-assistant-autonomy="autopilot" aria-pressed="false" disabled/);
  await h.dispatch('click', h.target('data-assistant-autonomy', 'autopilot'));
  assert.equal(h.saves.length, 0);
  await h.dispatch('click', h.target('data-assistant-autonomy', 'copilot'));
  assert.equal(h.saves[0].key, 'assistant_preferences'); assert.equal(h.saves[0].value.autonomy, 'copilot');
  await h.dispatch('click', h.target('data-assistant-tab', 'skills'));
  for (const skill of SKILLS.filter(item => item.status === 'connection_needed')) assert.match(h.render(), new RegExp(`data-assistant-skill="${skill.id}" disabled`));
  await h.dispatch('change', h.target('data-assistant-skill', 'workspace_mail', { checked: true }));
  assert.equal(h.saves.length, 1);
  await h.dispatch('change', h.target('data-assistant-skill', 'email_drafting', { checked: true }));
  assert.equal(h.saves[1].value.autonomy, 'copilot'); assert.ok(h.saves[1].value.skills.includes('email_drafting'));
});

test('failed preference saves retain previous focus and autonomy', async () => {
  const h = await harness({ save: async () => false });
  await h.dispatch('click', h.target('data-assistant-tab', 'autonomy'));
  await h.dispatch('click', h.target('data-assistant-autonomy', 'supervised'));
  assert.match(h.render(), /data-assistant-autonomy="advisor" aria-pressed="true"/);
  assert.match(h.render(), /data-assistant-autonomy="supervised" aria-pressed="false"/);
  assert.match(h.render(), /Not saved/);
});

test('account teardown and identity changes discard late save results', async () => {
  for (const ended of [true, false]) {
    const waiting = deferred(), h = await harness({ save: () => waiting.promise });
    const saving = h.dispatch('click', h.target('data-assistant-avatar', 'atlas'));
    if (ended) h.end(); else h.account.user = { id: 'member-b' };
    const count = h.events.length; waiting.resolve(true); await saving;
    assert.equal(h.render(), ''); assert.equal(h.events.length, count);
    await h.dispatch('click', h.target('data-assistant-avatar', 'maya'));
    assert.equal(h.saves.length, 1);
  }
});

test('search filters descriptions and cannot inject markup', async () => {
  const h = await harness();
  await h.dispatch('input', { id: 'assistant-persona-search', value: 'Maya' });
  assert.match(h.nodes.get('#assistant-avatar-results').innerHTML, /data-assistant-avatar="maya"/);
  assert.doesNotMatch(h.nodes.get('#assistant-avatar-results').innerHTML, /data-assistant-avatar="daniel"/);
  await h.dispatch('input', { id: 'assistant-persona-search', value: '<img src=x onerror=1>' });
  assert.match(h.render(), /&lt;img src=x onerror=1&gt;/); assert.doesNotMatch(h.render(), /<img src=x/);
  assert.match(h.nodes.get('#assistant-avatar-results').innerHTML, /No matches/);
});

test('skill launch only supplies a bounded catalogue draft and never sends or invokes connectors', async () => {
  const h = await harness(); await h.dispatch('click', h.target('data-assistant-tab', 'skills'));
  await h.dispatch('click', h.target('data-assistant-skill-prompt', 'email_drafting'));
  const events = h.events.filter(event => event.type === 'xtreme:assistant-prompt');
  assert.equal(events.length, 1); assert.match(events[0].detail.prompt, /do not send/);
  await h.dispatch('click', h.target('data-assistant-skill-prompt', 'workspace_mail'));
  await h.dispatch('click', h.target('data-assistant-skill-prompt', 'unknown'));
  assert.equal(h.events.filter(event => event.type === 'xtreme:assistant-prompt').length, 1);
  assert.equal(h.saves.length, 0);
});

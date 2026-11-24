import { AVATARS, SKILLS, AUTONOMY_LEVELS, DEFAULT_PREFERENCES } from './assistant-catalog.mjs';

const account = window.XtremeAccount;
const owner = account?.user?.id;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';
let ended = false, generation = 0, pending = null, notice = '', search = '', tab = 'avatars';
const failedKeys = new Set();
const savedModel = account?.read('model', 'eden');
let selected = AVATARS.some(avatar => avatar.id === savedModel) ? savedModel : 'eden';
const savedPreferences = account?.read('assistant_preferences', DEFAULT_PREFERENCES);
let preferences = {
  autonomy: AUTONOMY_LEVELS.some(level => level.available && level.id === savedPreferences?.autonomy) ? savedPreferences.autonomy : DEFAULT_PREFERENCES.autonomy,
  skills: Array.isArray(savedPreferences?.skills) ? [...new Set(savedPreferences.skills.filter(id => SKILLS.some(skill => skill.id === id && skill.status !== 'connection_needed')))] : [...DEFAULT_PREFERENCES.skills],
};
function current() { return !ended && owner && !account.locked && account.user?.id === owner; }
function active() { return current() && location.hash === '#models'; }
function changed() { if (current()) window.dispatchEvent(new Event('xtreme:assistant-settings-changed')); }
function disabled(key) { return Boolean(pending) || failedKeys.has(key); }
function currentAvatar() { return AVATARS.find(avatar => avatar.id === selected) || AVATARS[0]; }
function avatarResults() {
  const query = search.trim().toLowerCase();
  const matches = AVATARS.filter(avatar => [avatar.name, avatar.role, avatar.description].join(' ').toLowerCase().includes(query));
  if (!matches.length) return '<p class="assistant-collection-empty">No matches. Try a different name or specialty.</p>';
  return matches.map(avatar => `<button type="button" class="assistant-persona${selected === avatar.id ? ' is-selected' : ''}" data-assistant-avatar="${escape(avatar.id)}" aria-pressed="${selected === avatar.id}" aria-label="Choose ${escape(avatar.name)}, ${escape(avatar.role)}"${disabled('model') ? ' disabled' : ''}><span class="assistant-persona-top"><span class="assistant-monogram" aria-hidden="true">${escape(avatar.initials)}</span><span class="assistant-persona-check" aria-hidden="true">${selected === avatar.id ? check : ''}</span></span><strong>${escape(avatar.name)}</strong><span class="assistant-persona-role">${escape(avatar.role)}</span><span class="assistant-persona-description">${escape(avatar.description)}</span><span class="assistant-persona-foot">${selected === avatar.id ? 'Selected' : 'Choose style'} ${selected === avatar.id ? '' : arrow}</span></button>`).join('');
}
function avatarsPanel() {
  return `<div class="assistant-panel-heading"><h2>Find your fit.</h2><p>${AVATARS.length} personalities. One private assistant.</p></div><label class="assistant-search" for="assistant-persona-search"><span>Search names or specialties</span><input type="search" id="assistant-persona-search" maxlength="80" value="${escape(search)}" placeholder="Try estimating, calm, or Maya" autocomplete="off"></label><div id="assistant-avatar-results" class="assistant-persona-grid">${avatarResults()}</div>`;
}
function skillsPanel() {
  return `<div class="assistant-panel-heading"><h2>Advanced skills.</h2><p>Choose the expertise your assistant should focus on in chat.</p></div><div class="assistant-skill-list">${SKILLS.map(skill => {
    const unavailable = skill.status === 'connection_needed';
    const selectedSkill = preferences.skills.includes(skill.id);
    const status = unavailable ? 'Connection needed' : skill.status === 'external' ? 'Opens existing tool' : 'Available in app';
    return `<article class="assistant-skill"><label class="assistant-skill-choice"><input type="checkbox" data-assistant-skill="${escape(skill.id)}"${selectedSkill ? ' checked' : ''}${unavailable || disabled('assistant_preferences') ? ' disabled' : ''}><span><strong>${escape(skill.name)}</strong><small>${escape(skill.description)}</small></span></label><div class="assistant-skill-bottom"><span class="assistant-availability${unavailable ? ' is-pending' : ''}">${status}</span>${unavailable ? '<button type="button" class="assistant-skill-open" data-route="connections">View setup '+arrow+'</button>' : skill.route === 'messages' || skill.route === 'chat' ? `<button type="button" class="assistant-skill-open" data-assistant-skill-prompt="${escape(skill.id)}">Use in chat ${arrow}</button>` : `<button type="button" class="assistant-skill-open" data-route="${escape(skill.route)}">Open tool ${arrow}</button>`}</div></article>`;
  }).join('')}</div><p class="assistant-settings-note">Skill choices guide your next chat response. They do not connect accounts, send messages, or start work in the background.</p>`;
}
function autonomyPanel() {
  return `<div class="assistant-panel-heading"><h2>You set the pace.</h2><p>Choose how much initiative your assistant takes in chat.</p></div><div class="assistant-autonomy-list">${AUTONOMY_LEVELS.map((level, index) => `<article class="assistant-autonomy${preferences.autonomy === level.id ? ' is-selected' : ''}${level.available ? '' : ' is-unavailable'}"><button type="button" class="assistant-autonomy-choice" data-assistant-autonomy="${escape(level.id)}" aria-pressed="${preferences.autonomy === level.id}"${!level.available || disabled('assistant_preferences') ? ' disabled' : ''}><span class="assistant-level-number" aria-hidden="true">0${index + 1}</span><span><strong>${escape(level.name)}</strong><small>${escape(level.description)}</small></span><span class="assistant-level-check" aria-hidden="true">${preferences.autonomy === level.id ? check : !level.available ? 'Later' : ''}</span></button><div class="assistant-autonomy-detail"><span>${level.available ? 'What it can do' : 'Requires additional setup'}</span><ul>${level.canDo.map(item => `<li>${escape(item)}</li>`).join('')}</ul>${level.requiresApproval.length ? `<p><strong>Review & limits:</strong> ${level.requiresApproval.map(escape).join(' · ')}</p>` : ''}</div></article>`).join('')}</div><p class="assistant-settings-note">These settings never bypass your account permissions or approval screens. Autonomous background work is not enabled.</p>`;
}
function render() {
  if (!current()) return '';
  const avatar = currentAvatar();
  const level = AUTONOMY_LEVELS.find(item => item.id === preferences.autonomy);
  return `<section class="assistant-settings" aria-label="AI avatar, skills and autonomy"><div class="assistant-selected"><span class="assistant-selected-monogram" aria-hidden="true">${escape(avatar.initials)}</span><div><span class="assistant-selected-eyebrow">YOUR CHAT ASSISTANT</span><h2>${escape(avatar.name)}</h2><p>${escape(avatar.role)}</p><span class="assistant-selected-mode">${escape(level.name)} · ${preferences.skills.length} skill focuses</span></div></div><p class="assistant-settings-scope">Names and personalities apply to AI chat. Live video and voice keep the existing company assistant.</p><div class="assistant-settings-tabs" role="tablist" aria-label="Assistant settings">${[['avatars','Avatars'],['skills','Skills'],['autonomy','Autonomy']].map(([id,label]) => `<button type="button" id="assistant-tab-${id}" role="tab" aria-selected="${tab === id}" aria-controls="assistant-settings-panel" data-assistant-tab="${id}">${label}</button>`).join('')}</div><div id="assistant-settings-status" class="assistant-settings-status${failedKeys.size ? ' has-error' : ''}" role="status" aria-live="polite">${escape(pending ? 'Saving your preference…' : notice)}${failedKeys.size ? '<button type="button" data-account="reload">Reload to try again</button>' : ''}</div><div id="assistant-settings-panel" role="tabpanel" aria-labelledby="assistant-tab-${tab}">${tab === 'avatars' ? avatarsPanel() : tab === 'skills' ? skillsPanel() : autonomyPanel()}</div><button type="button" class="assistant-workspace-link" data-route="connections"><span><strong>Google Workspace</strong><small>Email, calendar, files & contacts</small></span>${arrow}</button></section>`;
}
async function save(key, value) {
  if (!current() || disabled(key)) return false;
  const revision = ++generation;
  pending = key; notice = ''; changed();
  let ok = false;
  try { ok = await account.save(key, structuredClone(value)); } catch {}
  if (!current() || revision !== generation) return false;
  pending = null;
  if (ok) {
    if (key === 'model') selected = value;
    else preferences = structuredClone(value);
    notice = 'Saved. Applies to your next chat message.';
  } else {
    failedKeys.add(key);
    notice = 'Not saved. Your previous selection remains active.';
  }
  changed();
  return ok;
}
document.addEventListener('click', async event => {
  if (!active()) return;
  const tabButton = event.target.closest?.('[data-assistant-tab]');
  if (tabButton && ['avatars','skills','autonomy'].includes(tabButton.dataset.assistantTab)) { event.preventDefault(); tab = tabButton.dataset.assistantTab; changed(); document.querySelector('#assistant-tab-'+tab)?.focus(); return; }
  const avatarButton = event.target.closest?.('[data-assistant-avatar]');
  if (avatarButton) { event.preventDefault(); const id = avatarButton.dataset.assistantAvatar; if (id !== selected && AVATARS.some(item => item.id === id)) await save('model', id); return; }
  const levelButton = event.target.closest?.('[data-assistant-autonomy]');
  if (levelButton) { event.preventDefault(); const id = levelButton.dataset.assistantAutonomy; if (id !== preferences.autonomy && AUTONOMY_LEVELS.some(item => item.id === id && item.available)) await save('assistant_preferences', { ...preferences, autonomy: id }); return; }
  const promptButton = event.target.closest?.('[data-assistant-skill-prompt]');
  if (promptButton) { event.preventDefault(); const skill = SKILLS.find(item => item.id === promptButton.dataset.assistantSkillPrompt && item.status !== 'connection_needed'); if (skill?.prompt) window.dispatchEvent(new CustomEvent('xtreme:assistant-prompt', { detail: { prompt: skill.prompt } })); }
});
document.addEventListener('change', async event => {
  if (!active()) return;
  const input = event.target.closest?.('[data-assistant-skill]');
  if (!input) return;
  const skill = SKILLS.find(item => item.id === input.dataset.assistantSkill && item.status !== 'connection_needed');
  if (!skill || disabled('assistant_preferences')) { input.checked = preferences.skills.includes(input.dataset.assistantSkill); return; }
  const skills = input.checked ? [...new Set([...preferences.skills, skill.id])] : preferences.skills.filter(id => id !== skill.id);
  await save('assistant_preferences', { ...preferences, skills });
});
document.addEventListener('input', event => {
  if (!active() || event.target.id !== 'assistant-persona-search') return;
  search = event.target.value.slice(0, 80);
  const results = document.querySelector('#assistant-avatar-results');
  if (results) results.innerHTML = avatarResults();
});
window.addEventListener('xtreme:account-ended', () => { ended = true; generation++; pending = null; selected = 'eden'; preferences = { ...DEFAULT_PREFERENCES, skills: [] }; search = ''; notice = ''; failedKeys.clear(); document.querySelector('.assistant-settings')?.replaceChildren(); });
window.XtremeAssistantSettings = { render };
window.dispatchEvent(new Event('xtreme:assistant-settings-ready'));

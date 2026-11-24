import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSISTANT_PERMISSION_IDS,
  ASSISTANT_APPROVAL_IDS,
  DEFAULT_ASSISTANT_CONTROLS,
  validAssistantControls,
  normalizeAssistantControls
} from '../server/assistant-controls.mjs';

test('default owner controls are valid, exhaustive, and future connectors are opt-in',()=>{
  assert.equal(validAssistantControls(DEFAULT_ASSISTANT_CONTROLS),true);
  assert.equal(DEFAULT_ASSISTANT_CONTROLS.mode,'full_partner');
  assert.equal(DEFAULT_ASSISTANT_CONTROLS.modules.google,true);
  assert.equal(DEFAULT_ASSISTANT_CONTROLS.modules.vercel,true);
  assert.equal(DEFAULT_ASSISTANT_CONTROLS.modules.autoSocial,false);
  assert.equal(DEFAULT_ASSISTANT_CONTROLS.modules.visualEditor,false);
  assert.equal(DEFAULT_ASSISTANT_CONTROLS.modules.scraperBrowser,false);
  assert.equal(DEFAULT_ASSISTANT_CONTROLS.modules.infinityLoop,false);
  assert.ok(ASSISTANT_PERMISSION_IDS.includes('google.gmail.send'));
  assert.ok(ASSISTANT_PERMISSION_IDS.includes('google.drive.share'));
  assert.ok(ASSISTANT_PERMISSION_IDS.includes('infinity.run'));
  assert.ok(ASSISTANT_APPROVAL_IDS.includes('send_email'));
  assert.ok(ASSISTANT_APPROVAL_IDS.includes('production_deploy'));
  assert.ok(!ASSISTANT_PERMISSION_IDS.includes('google.calendar.delete'));
});

test('owner controls reject unknown, duplicate, oversized, and structurally invalid authority',()=>{
  const unknown={...structuredClone(DEFAULT_ASSISTANT_CONTROLS),permissions:[...DEFAULT_ASSISTANT_CONTROLS.permissions,'arbitrary.root']};
  const duplicate={...structuredClone(DEFAULT_ASSISTANT_CONTROLS),approvals:['send_email','send_email']};
  const tooParallel=structuredClone(DEFAULT_ASSISTANT_CONTROLS);tooParallel.automation.parallelLimit=21;
  const extraModule=structuredClone(DEFAULT_ASSISTANT_CONTROLS);extraModule.modules.secretAdmin=true;
  const wrongVersion={...structuredClone(DEFAULT_ASSISTANT_CONTROLS),version:2};
  for(const value of [unknown,duplicate,tooParallel,extraModule,wrongVersion]) assert.equal(validAssistantControls(value),false);
});

test('normalizer fails closed to the declared default contract',()=>{
  const normalized=normalizeAssistantControls({version:999});
  assert.deepEqual(normalized,DEFAULT_ASSISTANT_CONTROLS);
  normalized.permissions.pop();
  assert.notDeepEqual(normalized.permissions,DEFAULT_ASSISTANT_CONTROLS.permissions);
});

test('owner control center exposes required policy surfaces and future connector slots without dead Calendar delete',()=>{
  const source=readFileSync(new URL('../public/owner-controls.js',import.meta.url),'utf8');
  for(const marker of [
    'OWNER CONTROL CENTER','Exactly what it may do','Approval gates','Memory & privacy',
    'Systems & integrations','Notifications & quiet hours','Advanced controls',
    'Auto Social','Visual Editor Canvas','Scraper Browser','X1 Infinity Loop','Delivery surface'
  ]) assert.ok(source.includes(marker),marker);
  assert.ok(!source.includes('google.calendar.delete'));
  assert.ok(source.includes("account.save('assistant_controls'"));
});

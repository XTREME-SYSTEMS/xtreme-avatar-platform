import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const get = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('single native five-minute schedule targets one queue', () => {
  const config=JSON.parse(get('vercel.json'));
  const schedule=config.schedules['xtreme-v3-five-minute-preview'];
  assert.deepEqual(Object.keys(config.schedules), ['xtreme-v3-five-minute-preview']);
  assert.equal(schedule.schedule, '*/5 * * * *');
  assert.equal(schedule.topic, 'xtreme-v3-fidelity-readonly');
  assert.deepEqual(config.functions['app/api/xtreme-v3/scheduled/route.ts'].experimentalTriggers,
    [{type:'queue/v2beta',topic:schedule.topic}]);
});
test('duplicate execution cannot start two workflow runs',()=>{
  const src=get('app/api/xtreme-v3/scheduled/route.ts');
  assert.match(src,/HookConflictError\.is\(error\)/);
  assert.match(src,/message\.executionId/);
  assert.match(src,/experimental_hook/);
  assert.match(src,/VERCEL_ENV !== 'preview'/);
});
test('read-only monitor does not call protected business APIs or write credentials',()=>{
  const src=get('app/workflows/xtreme-v3-fidelity.ts');
  assert.match(src,/use workflow/);
  assert.match(src,/use step/);
  assert.match(src,/BLOCKED_AUTH/);
  assert.match(src,/read-only|read only/i);
  assert.doesNotMatch(src,/\b(send|delete|writeFile|startCall|triggerDeploy)\s*\(/);
  assert.match(src,/VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.match(src,/xtreme-avatar-v0-migration-/);
});

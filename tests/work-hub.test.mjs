import test from 'node:test';
import assert from 'node:assert/strict';
import { safeHubLink, validHubDate } from '../server/work-hub.mjs';
import { fixture } from './work-hub-fixture.mjs';

export const job=(name='Warehouse floor')=>({name,client:'ACME',location:'Fort Lauderdale',stage:'estimating',dueDate:'2026-11-07',notes:'Prep and coating scope',links:[{label:'Plans',url:'https://drive.google.com/file/d/example/view'}]});
export const result=(title='Proposal')=>({title,kind:'proposal',text:'Draft scope for review.',links:[]});
const create=(f,u,id,data=job(),version=0,type='jobs')=>f.request(u,'/api/work-hub/'+type,{action:'create',version,id,data});

test('private workspace rejects anonymous, switched-account and cross-origin reads/writes',async()=>{
 const f=fixture();assert.equal((await f.request(null)).status,401);
 assert.equal((await f.request('alice','/api/work-hub',undefined,{'x-xtreme-account':'bob'})).status,409);
 assert.equal((await f.request('alice','/api/work-hub',undefined,{origin:'https://evil.test'})).status,403);
 assert.equal((await f.request('alice','/api/work-hub/jobs',{action:'create',version:0,id:'a',data:job()},{origin:'https://evil.test'})).status,403);
 assert.equal((await f.request('alice','/api/work-hub/jobs',{action:'create',version:0,id:'a',data:job()},{'x-xtreme-account':'bob'})).status,409);
 assert.equal((await f.request('alice','/api/work-hub/jobs',{action:'create',version:0,id:'a',data:job()},{'content-type':'text/plain'})).status,415);
});
test('jobs and results remain isolated including guessed IDs and forged owner fields',async()=>{
 const f=fixture();assert.equal((await create(f,'alice','shared',job('ALICE PRIVATE'))).status,200);assert.equal((await create(f,'bob','shared',job('BOB PRIVATE'))).status,200);
 const a=await f.request('alice','/api/work-hub?day=2026-11-07&user_id=bob');assert.equal(a.body.jobs[0].name,'ALICE PRIVATE');assert.equal(a.body.userId,'alice');assert.equal(a.headers.get('cache-control'),'private, no-store');
 assert.equal((await f.request('bob','/api/work-hub/jobs',{action:'update',version:1,id:'alice-only',data:job('Overwrite')})).status,404);
 assert.equal((await f.request('alice','/api/work-hub/jobs',{action:'create',version:1,id:'bad',data:job(),userId:'bob'})).status,400);
 assert.equal((await create(f,'alice','result-a',result('PRIVATE RESULT'),1,'results')).status,200);assert.deepEqual((await f.request('bob')).body.results,[]);
 assert.equal((await f.request('alice')).body.results[0].origin,'saved_by_you');
});
test('optimistic version prevents stale create, update, delete and duplicate submissions',async()=>{
 const f=fixture();assert.equal((await create(f,'alice','a')).body.version,1);assert.equal((await create(f,'alice','a')).status,409);
 assert.equal((await f.request('alice','/api/work-hub/jobs',{action:'update',version:1,id:'a',data:job('Updated')})).body.version,2);
 assert.equal((await f.request('alice','/api/work-hub/jobs',{action:'update',version:1,id:'a',data:job('Stale')})).status,409);
 assert.equal((await f.request('alice','/api/work-hub/jobs',{action:'delete',version:1,id:'a'})).status,409);
 assert.equal((await f.request('alice')).body.jobs[0].name,'Updated');
 assert.equal((await f.request('alice','/api/work-hub/jobs',{action:'delete',version:2,id:'a'})).body.version,3);assert.deepEqual((await f.request('alice')).body.jobs,[]);
});
test('revocation immediately before atomic insert/update/delete blocks late writes',async()=>{
 for(const action of ['create','update','delete']){
  const f=fixture();if(action!=='create')await create(f,'alice','a');
  f.setBeforeRun(sql=>{if(sql.includes('private_state')){f.setBeforeRun(null);f.sqlite.prepare("UPDATE members SET status='suspended' WHERE user_id='alice'").run();}});
  const input={action,version:action==='create'?0:1,id:'a',...(action==='delete'?{}:{data:job('Must not save')})};
  assert.equal((await f.request('alice','/api/work-hub/jobs',input)).status,409);
  const row=f.sqlite.prepare("SELECT value FROM private_state WHERE user_id='alice' AND key='work_hub_v1'").get();
  assert.equal(row?JSON.parse(row.value).jobs[0].name:null,action==='create'?null:'Warehouse floor');
 }
});
test('strict limits, canonical dates and safe links are validated without external fetching',async()=>{
 assert.equal(validHubDate('2026-02-30'),false);assert.equal(validHubDate('2028-02-29'),true);
 for(const link of ['javascript:alert(1)','data:text/html,x','http://example.com','https://u:p@example.com/a','https://localhost/a','https://127.0.0.1/a','https://2130706433/','https://[::1]/','https://example.com\\@evil.test','https://example.com\n'])assert.equal(safeHubLink(link),false,link);
 assert.equal(safeHubLink('https://drive.google.com/file/d/a/view?usp=sharing'),true);
 const f=fixture();for(const data of [{...job(),stage:'autonomous'}, {...job(),dueDate:'2026-02-30'}, {...job(),name:' '}, {...job(),notes:'a'.repeat(2001)}, {...job(),links:[{label:'Unsafe',url:'javascript:alert(1)'}]}, {...job(),owner:'bob'}])assert.equal((await create(f,'alice','bad',data)).status,400);
 assert.equal((await f.request('alice','/api/work-hub?day=not-a-date')).status,400);
 assert.equal((await f.request('alice','/api/work-hub/results',{action:'create',version:0,id:'r',data:{...result(),origin:'agent_complete'}})).status,400);
 for(let i=0;i<30;i++)assert.equal((await create(f,'alice','job_'+i,job(),i)).status,200);
 assert.equal((await create(f,'alice','overflow',job(),30)).status,409);
});
test('briefing uses saved job dates and task drafts only, leaves legacy state intact',async()=>{
 const f=fixture();const plans=[{id:'t1',kind:'Executive request',details:JSON.stringify({type:'xtreme-work-request',version:1,status:'draft',text:'Review warehouse scope\nTomorrow maybe'})},{id:'t2',kind:'Executive request',details:JSON.stringify({type:'xtreme-work-request',version:1,status:'done',text:'Finished by user'})},{id:'legacy',kind:'Call plan',details:'Keep original data'}];
 const serialized=JSON.stringify(plans);f.sqlite.prepare("INSERT INTO private_state VALUES('alice','plans',?,1,'2026-11-07')").run(serialized);
 await create(f,'alice','today');await create(f,'alice','overdue',{...job('Past date'),dueDate:'2026-11-06'},1);await create(f,'alice','done',{...job('Completed'),stage:'complete',dueDate:'2026-11-06'},2);
 const b=(await f.request('alice')).body.briefing;assert.equal(b.dueToday.length,1);assert.equal(b.overdue.length,1);assert.equal(b.openTaskCount,1);assert.equal(b.completedTaskCount,1);assert.equal(b.openTasks[0].title,'Review warehouse scope');assert.equal(b.googleMail,'not_connected');assert.equal(b.googleCalendar,'not_connected');
 assert.equal(f.sqlite.prepare("SELECT value FROM private_state WHERE user_id='alice' AND key='plans'").get().value,serialized);
 assert.equal((await f.request('bob')).body.briefing.openTaskCount,0);
});

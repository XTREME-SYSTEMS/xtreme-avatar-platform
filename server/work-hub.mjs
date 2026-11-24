import { requireMember, readBody, jsonResponse } from './accounts.mjs';

const KEY='work_hub_v1', MAX_JOBS=30, MAX_RESULTS=50, MAX_BYTES=220000;
const STAGES=['lead','estimating','scheduled','active','complete'];
const fail=(status,message,code)=>{throw Object.assign(new Error(message),{status,code});};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>plain(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const idOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
export function validHubDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value&&value>='2000-01-01'&&value<='2100-12-31';}
export function safeHubLink(value){
 if(!text(value,2048)||value!==value.trim()||/[\s\\]/.test(value))return false;
 try{const u=new URL(value),h=u.hostname.toLowerCase().replace(/\.$/,'');return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&!['localhost','localhost.localdomain'].includes(h)&&!h.endsWith('.local')&&!h.endsWith('.internal')&&!h.endsWith('.localhost')&&!/^\[/.test(h)&&!/^\d+(?:\.\d+){3}$/.test(h)&&h.includes('.');}catch{return false;}
}
function linksOK(links){return Array.isArray(links)&&links.length<=5&&links.every(l=>exact(l,['label','url'])&&text(l.label,80)&&l.label.trim()&&safeHubLink(l.url));}
function validateJob(v){
 if(!exact(v,['name','client','location','stage','dueDate','notes','links'])||!text(v.name,100)||!v.name.trim()||!text(v.client,100)||!text(v.location,160)||!STAGES.includes(v.stage)||!(v.dueDate===''||validHubDate(v.dueDate))||!text(v.notes,2000)||!linksOK(v.links))fail(400,'Check the job name, date, notes, and HTTPS document links.');
 return {...v,name:v.name.trim(),client:v.client.trim(),location:v.location.trim(),notes:v.notes.trim(),links:v.links.map(l=>({label:l.label.trim(),url:l.url}))};
}
function validateResult(v){
 if(!exact(v,['title','kind','text','links'])||!text(v.title,100)||!v.title.trim()||!['note','proposal','estimate','document','other'].includes(v.kind)||!text(v.text,6000)||!linksOK(v.links)||(!v.text.trim()&&!v.links.length))fail(400,'Add a title and saved text or an HTTPS document link.');
 return {...v,title:v.title.trim(),text:v.text.trim()};
}
function decode(row){
 if(!row)return {version:0,jobs:[],results:[]};
 try{const data=JSON.parse(row.value);if(!plain(data)||data.schema!==1||!Array.isArray(data.jobs)||!Array.isArray(data.results)||data.jobs.length>MAX_JOBS||data.results.length>MAX_RESULTS)throw new Error();return {version:row.version,jobs:data.jobs,results:data.results};}catch{fail(503,'Your saved work could not be read. No changes were made.');}
}
async function readHub(db,userId){return decode(await db.prepare('SELECT value,version FROM private_state WHERE user_id=? AND key=?').bind(userId,KEY).first());}
export function briefFromSaved(hub,plans,day){
 const tasks=[];
 for(const p of Array.isArray(plans)?plans.slice(0,30):[]){
  if(p?.kind!=='Executive request'||typeof p.details!=='string')continue;
  try{const t=JSON.parse(p.details);if(t.type!=='xtreme-work-request'||t.version!==1||!['draft','done'].includes(t.status)||typeof t.text!=='string')continue;tasks.push({id:String(p.id).slice(0,80),title:t.text.split('\n')[0].slice(0,100),status:t.status,created:typeof p.created==='string'?p.created.slice(0,40):''});}catch{}
 }
 const open=hub.jobs.filter(j=>j.stage!=='complete');
 return {day,source:'Your saved jobs and task drafts',dueToday:open.filter(j=>j.dueDate===day).map(j=>({id:j.id,name:j.name,stage:j.stage})),overdue:open.filter(j=>validHubDate(j.dueDate)&&j.dueDate<day).map(j=>({id:j.id,name:j.name,dueDate:j.dueDate})),unscheduledJobs:open.filter(j=>!j.dueDate).length,openTasks:tasks.filter(t=>t.status==='draft').slice(0,8),openTaskCount:tasks.filter(t=>t.status==='draft').length,completedTaskCount:tasks.filter(t=>t.status==='done').length,googleCalendar:'not_connected',googleMail:'not_connected'};
}
async function summary(db,userId,hub,day){
 const saved=await db.prepare("SELECT value FROM private_state WHERE user_id=? AND key='plans'").bind(userId).first();let plans=[];try{plans=saved?JSON.parse(saved.value):[];}catch{}
 return {userId,version:hub.version,jobs:hub.jobs,results:hub.results,briefing:briefFromSaved(hub,plans,day),limits:{jobs:MAX_JOBS,results:MAX_RESULTS,linksPerItem:5},refreshedAt:new Date().toISOString()};
}
export async function handleWorkHub(request,env){
 try{
  const url=new URL(request.url),path=url.pathname;
  if(!['/api/work-hub','/api/work-hub/jobs','/api/work-hub/results'].includes(path))return jsonResponse({error:'Not found.'},404);
  if((request.method==='GET'&&path!=='/api/work-hub')||!['GET','POST'].includes(request.method)||(request.method==='POST'&&path==='/api/work-hub'))return jsonResponse({error:'Method not allowed.'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)fail(403,'Open this request from Xtreme Avatar.');
  const input=request.method==='POST'?await readBody(request):null;
  const user=await requireMember(request,env),db=env.DB;
  if(request.headers.get('x-xtreme-account')!==user.user_id)fail(409,'Your signed-in account changed. Reload your workspace.','account_changed');
  const hub=await readHub(db,user.user_id);
  if(request.method==='GET'){
   const day=url.searchParams.get('day')||new Date().toISOString().slice(0,10);if(!validHubDate(day))fail(400,'Choose a valid briefing date.');
   return jsonResponse(await summary(db,user.user_id,hub,day));
  }
  const removing=input?.action==='delete';
  if(!exact(input,removing?['action','version','id']:['action','version','id','data'])||!['create','update','delete'].includes(input.action)||!idOK(input.id)||!Number.isSafeInteger(input.version)||input.version<0)fail(400,'Invalid work request.');
  if(hub.version!==input.version)fail(409,'Your workspace changed in another tab. Refresh before saving.','version_conflict');
  const type=path.endsWith('/jobs')?'jobs':'results',list=hub[type],existing=list.find(v=>v.id===input.id);
  if(input.action==='create'&&existing)fail(409,'This item is already saved. Refresh your workspace.','duplicate_item');
  if(input.action!=='create'&&!existing)fail(404,'This item is no longer in your workspace.');
  if(input.action==='create'&&list.length>=(type==='jobs'?MAX_JOBS:MAX_RESULTS))fail(409,`Your workspace has reached its ${type==='jobs'?MAX_JOBS:MAX_RESULTS} ${type} limit. Remove an old item first.`);
  const now=new Date().toISOString();
  const value=removing?null:{...(type==='jobs'?validateJob(input.data):validateResult(input.data)),id:input.id,createdAt:existing?.createdAt||now,updatedAt:now,...(type==='results'?{origin:'saved_by_you'}:{})};
  const next={schema:1,jobs:hub.jobs,results:hub.results,[type]:removing?list.filter(v=>v.id!==input.id):existing?list.map(v=>v.id===input.id?value:v):[...list,value]};
  const payload=JSON.stringify(next);if(new TextEncoder().encode(payload).byteLength>MAX_BYTES)fail(413,'Your saved work is full. Shorten notes or remove old items before saving.');
  const result=hub.version===0
   ?await db.prepare("INSERT OR IGNORE INTO private_state(user_id,key,value,version,updated_at) SELECT ?,?,?,1,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(user.user_id,KEY,payload,now,user.user_id).run()
   :await db.prepare("UPDATE private_state SET value=?,version=version+1,updated_at=? WHERE user_id=? AND key=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(payload,now,user.user_id,KEY,hub.version,user.user_id).run();
  if(result.meta.changes!==1)fail(409,'Your workspace or access changed. Refresh before saving.','version_conflict');
  return jsonResponse({saved:true,userId:user.user_id,id:input.id,version:hub.version+1});
 }catch(error){return jsonResponse({error:error.status?error.message:'Your workspace is temporarily unavailable.',...(error.code?{code:error.code}:{})},error.status||503);}
}

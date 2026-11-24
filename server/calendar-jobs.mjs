import {requireMember} from './accounts.mjs';
import {resolveCalendarBinding} from './calendar-binding.mjs';
import {handleJobFile,reconcileJobUploads} from './job-files.mjs';
import {JOB_FILE_LIMITS,JOB_PATHS,EVENT_ID,EVENT_REF,JOB_DEFAULT,exact,fail,revisionOf,checkJobData,jobKey,boundedJobJson,jobJson,publicAttachment} from './calendar-job-core.mjs';
async function linkedJobExists(db,userId,id){if(id===null)return true;const row=await db.prepare("SELECT value FROM private_state WHERE user_id=? AND key='work_hub_v1'").bind(userId).first();try{const data=JSON.parse(row?.value||'{}');return Array.isArray(data.jobs)&&data.jobs.some(job=>job?.id===id);}catch{return false;}}
export async function readCalendarJob(db,userId,eventRef){const row=await db.prepare('SELECT value,version FROM private_state WHERE user_id=? AND key=?').bind(userId,jobKey(eventRef)).first();if(!row)return {version:0,job:{...JOB_DEFAULT}};try{const data=JSON.parse(row.value);if(!exact(data,['schema','job'])||data.schema!==1)throw Error();return {version:row.version,job:checkJobData(data.job)};}catch{fail(503,'job_unavailable','Your saved job details could not be read.');}}
export async function handleCalendarJob(request,env,dependencies={}){
 try{
  const url=new URL(request.url),path=url.pathname;
  if(!JOB_PATHS.includes(path))fail(404,'not_found','This job route was not found.');
  const isRead=path==='/api/calendar/job-files/content'||(path==='/api/calendar/job'&&request.method==='GET');
  if(request.method!==(isRead?'GET':'POST'))fail(405,'method_not_allowed','This method is not supported.');
  if((request.method==='POST'&&request.headers.get('origin')!==url.origin)||(request.headers.get('origin')&&request.headers.get('origin')!==url.origin))fail(403,'invalid_origin','Open this request from Xtreme Avatar.');
  const user=await requireMember(request,env);
  if(request.headers.get('x-xtreme-account')!==user.user_id)fail(409,'account_changed','Your signed-in account changed. Reload to continue.');
  const revision=revisionOf(request),binary=path==='/api/calendar/job-files/upload';
  const input=request.method==='POST'&&!binary?await boundedJobJson(request):null;
  const eventId=input?.eventId??url.searchParams.get('eventId');
  if(!EVENT_ID.test(eventId||''))fail(400,'invalid_request','Choose a valid appointment.');
  const allowedQuery=binary||path.endsWith('/content')?['eventId','attachmentId']:isRead?['eventId']:[];
  if([...url.searchParams.keys()].some(key=>!allowedQuery.includes(key))||allowedQuery.some(key=>url.searchParams.getAll(key).length!==1))fail(400,'invalid_request','This job request is not valid.');
  const bindingArgs={accessToken:env.ACCESS_TOKEN,userId:user.user_id,origin:env.APP_ORIGIN,eventId,connectionRevision:revision,fetcher:dependencies.fetcher,signal:AbortSignal.any([request.signal,AbortSignal.timeout(100000)])};
  const resolver=dependencies.resolveBinding||resolveCalendarBinding;
  const binding=await resolver(bindingArgs);
  if(!EVENT_REF.test(binding?.eventRef||'')||binding.eventId!==eventId||binding.connectionRevision!==revision)fail(502,'calendar_response_invalid','Calendar returned an unreadable result.');
  const revalidate=async()=>{if(bindingArgs.signal.aborted)fail(409,'request_cancelled','This request was cancelled.');const latest=await resolver(bindingArgs);if(latest.eventRef!==binding.eventRef||latest.eventId!==eventId||latest.connectionRevision!==revision)fail(409,'connection_changed','Your Google account changed. Refresh before continuing.');};
  const eventRef=binding.eventRef,db=env.DB,hub=await readCalendarJob(db,user.user_id,eventRef);
  if(path!=='/api/calendar/job')return await handleJobFile(request,env,{user,eventId,eventRef,hub,input,dependencies,revalidate,signal:bindingArgs.signal});
  if(request.method==='GET'){
   let attachments=[];
   if(env.FILE_STORAGE&&typeof db.fileOperation==='function'){
    await reconcileJobUploads(env,user,eventRef,bindingArgs.signal);
    const rows=await db.prepare("SELECT attachment_id,file_name,mime_type,byte_size,status,version,created_at FROM job_attachments WHERE user_id=? AND event_ref=? AND status!='deleted' ORDER BY created_at DESC LIMIT 30").bind(user.user_id,eventRef).all();
    attachments=rows.results.map(publicAttachment);
   }
   await revalidate();
   await requireMember(request,env);
   return jobJson({eventId,eventRef,...hub,projectMissing:!await linkedJobExists(db,user.user_id,hub.job.jobId),attachments,capabilities:{attachments:!!env.FILE_STORAGE},limits:JOB_FILE_LIMITS});
  }
  if(!exact(input,['eventId','version','data'])||!Number.isSafeInteger(input.version)||input.version<0)fail(400,'invalid_request','This job request is not valid.');
  if(input.version!==hub.version)fail(409,'version_conflict','Your job details changed. Refresh before saving.');
  const data=checkJobData(input.data);
  if(!await linkedJobExists(db,user.user_id,data.jobId))fail(409,'job_missing','Choose an existing job folder from your account.');
  const value=JSON.stringify({schema:1,job:data}),now=new Date().toISOString();
  const result=hub.version===0
   ?await db.prepare("INSERT OR IGNORE INTO private_state(user_id,key,value,version,updated_at) SELECT ?,?,?,1,? WHERE EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(user.user_id,jobKey(eventRef),value,now,user.user_id).run()
   :await db.prepare("UPDATE private_state SET value=?,version=version+1,updated_at=? WHERE user_id=? AND key=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE user_id=? AND status='active')").bind(value,now,user.user_id,jobKey(eventRef),hub.version,user.user_id).run();
  if(result.meta.changes!==1)fail(409,'version_conflict','Your job details or account access changed. Refresh before saving.');
  return jobJson({saved:true,version:hub.version+1});
 }catch(error){return jobJson({code:error.status?error.code||'job_unavailable':'job_unavailable',error:error.status?error.message:'Job details are temporarily unavailable.'},error.status||503);}
}

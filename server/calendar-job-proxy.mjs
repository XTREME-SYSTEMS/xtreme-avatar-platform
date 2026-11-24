import {GOOGLE_APP_ORIGINS} from './google-workspace-proxy.mjs';
import {JOB_PATHS,JOB_FILE_LIMITS,UUID as FILE_UUID,EVENT_REF,checkJobData,cleanText,boundedBytes,privateHeaders,jobJson,revisionOf,fail} from './calendar-job-core.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_TEXT=Object.freeze({
 sign_in_required:'Sign in again to open your job details.',account_changed:'Your signed-in account changed. Reload to continue.',
 invalid_origin:'Open Xtreme Avatar directly.',connection_revision_required:'Refresh your Google connection.',
 connection_changed:'Your Google connection changed. Refresh before continuing.',calendar_reconnect_required:'Reconnect your Google account.',
 calendar_scope_required:'Reconnect Google and approve Calendar access.',google_connection_required:'Connect Google to open this appointment.',
 calendar_disabled:'Calendar is not enabled yet.',calendar_rate_limited:'Please wait before opening more job files.',
 calendar_timeout:'Calendar took too long to respond.',calendar_unavailable:'Calendar is temporarily unavailable.',
 access_required:'Your account no longer has access.',version_conflict:'Your job details changed. Refresh before saving.',
 attachment_missing:'This file is no longer available.',attachment_busy:'This file is still being processed. Refresh its status.',
 attachment_changed:'This file changed. Refresh before continuing.',invalid_file:'Choose a JPG, PNG, WebP or PDF within 4 MB.',
 file_limit:'This job has reached its file limit. Remove a file first.',storage_limit:'Your private file storage is full.',
 duplicate_request:'This request belongs to another file.',job_missing:'Choose an existing job folder and save the details first.',
 file_unavailable:'This private file is temporarily unavailable.',upload_unconfirmed:'The upload result is not confirmed. Refresh before taking another action.',
 file_rejected:'This file does not match a supported JPG, PNG, WebP or PDF.',file_not_ready:'This file is not ready to open.',
 files_setup_required:'Private job files are not enabled yet.',file_too_large:'This file is larger than the 4 MB limit.',
 invalid_job:'Check the job details before saving.',request_cancelled:'This request was cancelled.'
});
function attachment(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||!FILE_UUID.test(data.id||'')||!cleanText(data.fileName,160)||!data.fileName.trim()||!JOB_FILE_LIMITS.mimeTypes.includes(data.mimeType)||!Number.isSafeInteger(data.byteSize)||data.byteSize<1||data.byteSize>JOB_FILE_LIMITS.fileBytes||!['reserved','uploading','ready','deleting','deleted','failed'].includes(data.status)||!Number.isSafeInteger(data.version)||data.version<1||typeof data.createdAt!=='string'||data.createdAt.length>40||!Number.isFinite(Date.parse(data.createdAt)))throw Error('Invalid private result');
 return {id:data.id,fileName:data.fileName,mimeType:data.mimeType,byteSize:data.byteSize,status:data.status,version:data.version,createdAt:data.createdAt};
}
async function projectResult(response,path,requestURL){
 let bytes;try{bytes=await boundedBytes(response,path.endsWith('/content')&&response.status===200?JOB_FILE_LIMITS.fileBytes:65536);}catch{fail(502,'job_unavailable','Private job details could not be read.');}
 if(path.endsWith('/content')&&response.status===200){
  const mime=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(!JOB_FILE_LIMITS.mimeTypes.includes(mime)||!bytes.length||!response.headers.get('content-disposition')?.startsWith('attachment;'))throw Error('Invalid private file result');
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[mime];
  return new Response(bytes,{headers:privateHeaders({'content-type':mime,'content-length':String(bytes.length),'content-disposition':'attachment; filename="job-file.'+ext+'"','content-security-policy':"default-src 'none'; sandbox"})});
 }
 if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw Error('Invalid private JSON result');
 let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('Invalid private JSON result');}
 if(!response.ok){const code=typeof data?.code==='string'&&Object.hasOwn(ERROR_TEXT,data.code)?data.code:'job_unavailable';return jobJson({code,error:ERROR_TEXT[code]||'Private job details are temporarily unavailable.'},[400,401,403,404,409,413,415,429,502,503,504].includes(response.status)?response.status:503);}
 if(response.status!==200||!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid private result');
 if(path==='/api/calendar/job'&&requestURL.search){
  if(data.eventId!==requestURL.searchParams.get('eventId')||!EVENT_REF.test(data.eventRef||'')||!Number.isSafeInteger(data.version)||data.version<0||typeof data.projectMissing!=='boolean'||typeof data.capabilities?.attachments!=='boolean'||!Array.isArray(data.attachments)||data.attachments.length>30)throw Error('Invalid job result');
  return jobJson({eventId:data.eventId,eventRef:data.eventRef,version:data.version,job:checkJobData(data.job),projectMissing:data.projectMissing,attachments:data.attachments.map(attachment),capabilities:{attachments:data.capabilities.attachments},limits:JOB_FILE_LIMITS});
 }
 if(path==='/api/calendar/job'){if(data.saved!==true||!Number.isSafeInteger(data.version)||data.version<1)throw Error('Invalid save result');return jobJson({saved:true,version:data.version});}
 if(path.endsWith('/remove')){if(data.removed!==true||!FILE_UUID.test(data.attachmentId||''))throw Error('Invalid remove result');return jobJson({removed:true,attachmentId:data.attachmentId});}
 return jobJson({attachment:attachment(data.attachment),...(typeof data.replayed==='boolean'?{replayed:data.replayed}:{})});
}

export function createCalendarJobProxy({authClient,publicConfig,fetcher=fetch}){
 return async function proxy(request){
  try{
   const url=new URL(request.url),path=url.pathname;
   if(!JOB_PATHS.includes(path))return jobJson({code:'not_found',error:'This job route was not found.'},404);
   const read=path.endsWith('/content')||(path==='/api/calendar/job'&&request.method==='GET');
   if(request.method!==(read?'GET':'POST'))return jobJson({code:'method_not_allowed',error:'This method is not supported.'},405);
   const origin=request.headers.get('origin');
   if(!GOOGLE_APP_ORIGINS.includes(url.origin)||(request.method==='POST'&&origin!==url.origin)||(origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return jobJson({code:'invalid_origin',error:'Open Xtreme Avatar directly.'},403);
   for(const key of request.headers.keys())if(['authorization','apikey','x-api-key','x-user-id','x-supabase-user-id','x-organization-id'].includes(key)||key.startsWith('oai-authenticated-')||key.startsWith('x-oai-')||(key.startsWith('x-xtreme-')&&!['x-xtreme-account','x-xtreme-connection-revision'].includes(key)))return jobJson({code:'invalid_request',error:'This request is not valid.'},400);
   const client=await authClient(),verified=await client.auth.getUser(),user=verified?.data?.user;
   if(verified.error||!UUID.test(user?.id||'')||!user?.email_confirmed_at||user.is_anonymous)return jobJson({code:'sign_in_required',error:'Sign in to open your job details.'},401);
   const result=await client.auth.getSession(),session=result?.data?.session;
   if(result.error||session?.user?.id!==user.id||typeof session.access_token!=='string'||!session.access_token||session.access_token.length>16384||/\s/.test(session.access_token))return jobJson({code:'sign_in_required',error:'Sign in again to continue.'},401);
   if(request.headers.get('x-xtreme-account')!==user.id)return jobJson({code:'account_changed',error:'Your signed-in account changed. Reload to continue.'},409);
   const revision=revisionOf(request),binary=path.endsWith('/upload');
   const query=read||binary?path==='/api/calendar/job'?['eventId']:['eventId','attachmentId']:[];
   if([...url.searchParams.keys()].some(k=>!query.includes(k))||query.some(k=>url.searchParams.getAll(k).length!==1))return jobJson({code:'invalid_request',error:'This request is not valid.'},400);
   let body;
   if(request.method==='POST'){
    const type=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if(type!==(binary?'application/octet-stream':'application/json'))return jobJson({code:'invalid_content_type',error:'This request has an unsupported format.'},415);
    body=await boundedBytes(request,binary?JOB_FILE_LIMITS.fileBytes:16384);
   }
   if(request.signal.aborted)return jobJson({code:'request_cancelled',error:'This request was cancelled.'},409);
   const config=publicConfig();
   if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)||typeof config.key!=='string')throw Error();
   const response=await fetcher(config.url+'/functions/v1/xtreme-avatar-api'+path+url.search,{method:request.method,headers:{authorization:'Bearer '+session.access_token,apikey:config.key,origin:url.origin,'x-xtreme-account':user.id,'x-xtreme-connection-revision':String(revision),...(request.method==='POST'?{'content-type':binary?'application/octet-stream':'application/json'}:{})},body,redirect:'manual',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(110000),request.signal])});
   if(response.status>=300&&response.status<400){await response.body?.cancel();return jobJson({code:'job_unavailable',error:'Private job details are temporarily unavailable.'},502);}
   if(request.signal.aborted){await response.body?.cancel();return jobJson({code:'request_cancelled',error:'This request was cancelled.'},409);}
   return await projectResult(response,path,url);
  }catch(error){return jobJson({code:error.status?error.code:'job_unavailable',error:error.status?error.message:'Private job details are temporarily unavailable.'},error.status||503);}
 };
}

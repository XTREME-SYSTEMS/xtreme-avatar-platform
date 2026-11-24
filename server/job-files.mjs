import {requireMember} from './accounts.mjs';
import {JOB_FILE_LIMITS,UUID,exact,fail,cleanText,boundedBytes,jobJson,privateHeaders,publicAttachment} from './calendar-job-core.mjs';
const errors={
 access_required:[403,'Your account no longer has access.'],version_conflict:[409,'Your job details changed. Refresh before saving.'],
 attachment_missing:[404,'This file is no longer available.'],attachment_busy:[409,'This file is still being processed. Refresh its status before retrying.'],
 attachment_changed:[409,'This file changed. Refresh before continuing.'],invalid_file:[400,'Choose a JPG, PNG, WebP or PDF within the size limit.'],
 file_limit:[409,'This job has reached its file limit. Remove a file first.'],storage_limit:[409,'Your private file storage is full. Remove an old file first.'],
 duplicate_request:[409,'This upload request belongs to another file. Refresh before continuing.'],job_missing:[409,'Save the job details before adding files.'],
 file_unavailable:[503,'Private files are temporarily unavailable.'],upload_unconfirmed:[503,'The upload result is not confirmed. Refresh before taking another action.'],
 file_rejected:[415,'This file does not match a supported JPG, PNG, WebP or PDF.'],file_not_ready:[409,'This file is not ready to open. Refresh its status.']
};
async function operation(db,action,input){const result=await db.fileOperation(action,input);if(!result?.ok){const code=result?.code&&Object.hasOwn(errors,result.code)?result.code:'file_unavailable';const [status,message]=errors[code];fail(status,code,message);}return result;}
export function sniffJobFile(bytes,mime){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>JOB_FILE_LIMITS.fileBytes)return false;
 const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(mime==='image/jpeg')return bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217;
 if(mime==='image/png')return bytes.length>=45&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&ascii(12,16)==='IHDR'&&ascii(bytes.length-8,bytes.length-4)==='IEND';
 if(mime==='image/webp')return bytes.length>=20&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(ascii(12,16))&&new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true)+8===bytes.length;
 if(mime==='application/pdf')return bytes.length>=12&&/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(ascii(0,8))&&ascii(Math.max(0,bytes.length-1024),bytes.length).includes('%%EOF');
 return false;
}
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function ownRow(db,userId,eventRef,id){if(!UUID.test(id||''))fail(400,'invalid_request','Choose a valid file.');const row=await db.prepare('SELECT * FROM job_attachments WHERE attachment_id=? AND user_id=? AND event_ref=?').bind(id,userId,eventRef).first();if(!row)fail(404,'attachment_missing','This file is no longer available.');return row;}
export async function handleJobFile(request,env,{user,eventId,eventRef,hub,input,revalidate,signal}){
 const db=env.DB,storage=env.FILE_STORAGE,path=new URL(request.url).pathname;
 if(!storage||typeof db.fileOperation!=='function')fail(503,'files_setup_required','Private job files are not enabled yet.');
 if(path.endsWith('/reserve')){
  if(!exact(input,['eventId','jobVersion','requestId','fileName','mimeType','byteSize'])||!Number.isSafeInteger(input.jobVersion)||input.jobVersion<1||input.jobVersion!==hub.version||!UUID.test(input.requestId||'')||!cleanText(input.fileName,160)||!input.fileName.trim()||/[\/\\]/.test(input.fileName)||!JOB_FILE_LIMITS.mimeTypes.includes(input.mimeType)||!Number.isSafeInteger(input.byteSize)||input.byteSize<1||input.byteSize>JOB_FILE_LIMITS.fileBytes)fail(400,'invalid_file','Save job details, then choose a JPG, PNG, WebP or PDF within 4 MB.');
  const result=await operation(db,'reserve',{eventRef,jobVersion:hub.version,jobId:hub.job.jobId,requestId:input.requestId,fileName:input.fileName.trim(),mimeType:input.mimeType,byteSize:input.byteSize});
  return jobJson({attachment:publicAttachment(result.row),replayed:result.replayed===true});
 }
 const id=input?.attachmentId??new URL(request.url).searchParams.get('attachmentId'),row=await ownRow(db,user.user_id,eventRef,id);
 if(path.endsWith('/upload')){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/octet-stream')fail(415,'invalid_content_type','Upload this file as binary data.');
  if(!['ready','reserved'].includes(row.status))fail(409,'attachment_busy','This upload already started. Refresh its status before retrying.');
  const bytes=await boundedBytes(request,JOB_FILE_LIMITS.fileBytes);
  if(bytes.length!==row.byte_size||!sniffJobFile(bytes,row.mime_type))fail(415,'file_rejected','This file does not match a supported JPG, PNG, WebP or PDF.');
  const hash=await digest(bytes);
  if(row.status==='ready'){if(row.sha256!==hash)fail(409,'attachment_changed','This upload belongs to different file bytes.');await revalidate();return jobJson({attachment:publicAttachment(row),replayed:true});}
  const claim=await operation(db,'claim',{id,eventRef,sha256:hash}),claimed=claim.row;
  if(claim.replayed)return jobJson({attachment:publicAttachment(claimed),replayed:true});
  try{await storage.put(claimed.object_name,bytes,claimed.mime_type,{signal});}catch{fail(503,'upload_unconfirmed','The upload result is not confirmed. Refresh before taking another action.');}
  // Finalization independently rechecks active membership and exact reservation.
  await revalidate();
  const result=await operation(db,'finish',{id,eventRef,lease:claimed.upload_nonce,sha256:hash,byteSize:bytes.length,mimeType:claimed.mime_type});
  return jobJson({attachment:publicAttachment(result.row)});
 }
 if(path.endsWith('/content')){
  if(row.status!=='ready'||!/^[0-9a-f]{64}$/.test(row.sha256||''))fail(409,'file_not_ready','This file is not ready to open.');
  let bytes;try{bytes=await storage.get(row.object_name,{signal});}catch{fail(503,'file_unavailable','This private file could not be opened.');}
  if(bytes.length!==row.byte_size||bytes.length>JOB_FILE_LIMITS.fileBytes||await digest(bytes)!==row.sha256||!sniffJobFile(bytes,row.mime_type))fail(503,'file_unavailable','This private file could not be verified.');
  await revalidate();
  await requireMember(request,env);
  const current=await ownRow(db,user.user_id,eventRef,id);if(current.status!=='ready'||current.version!==row.version)fail(409,'attachment_changed','This file changed. Refresh before continuing.');
  // Every raw file is download-only. Frontend may draw a bounded decoded image
  // onto canvas; this endpoint never serves active inline document content.
  const filename=row.file_name.replace(/[\r\n"\\]/g,'_').replace(/[^\x20-\x7e]/g,'_')||'attachment';
  return new Response(bytes,{status:200,headers:privateHeaders({'content-type':row.mime_type,'content-length':String(bytes.length),'content-disposition':'attachment; filename="'+filename+'"','content-security-policy':"default-src 'none'; sandbox"})});
 }
 if(path.endsWith('/remove')){
  if(!exact(input,['eventId','attachmentId','version','confirm'])||input.confirm!==true||!Number.isSafeInteger(input.version)||input.version<1)fail(400,'invalid_request','Confirm the file removal.');
  const claim=await operation(db,'delete_begin',{id,eventRef,version:input.version});
  if(claim.row.status==='deleted')return jobJson({removed:true,attachmentId:id});
  try{await storage.remove(claim.row.object_name,{signal});}catch{fail(503,'file_unavailable','File removal is not confirmed. Refresh and try again.');}
  await revalidate();
  await operation(db,'delete_finish',{id,eventRef,version:claim.row.version});
  return jobJson({removed:true,attachmentId:id});
 }
 fail(404,'not_found','This file route was not found.');
}

// Reconcile only bytes from an already reserved upload, never send bytes again.
export async function reconcileJobUploads(env,user,eventRef,signal){
 const rows=await env.DB.prepare("SELECT * FROM job_attachments WHERE user_id=? AND event_ref=? AND status='uploading' ORDER BY created_at LIMIT 1").bind(user.user_id,eventRef).all();
 for(const row of rows.results){
  if(!/^[0-9a-f]{64}$/.test(row.sha256||''))continue;
  try{const bytes=await env.FILE_STORAGE.get(row.object_name,{signal});
   if(bytes.length!==row.byte_size||!sniffJobFile(bytes,row.mime_type)||await digest(bytes)!==row.sha256)continue;
   await operation(env.DB,'finish',{id:row.attachment_id,eventRef,lease:row.upload_nonce,sha256:row.sha256,byteSize:bytes.length,mimeType:row.mime_type});
  }catch{/* Preserve uncertain reservation and its quota; no repeat upload. */}
 }
}

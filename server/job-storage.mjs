// Private Storage transport. This module is instantiated only inside Supabase
// Edge with its existing server credential; it never exposes that credential.
import {JOB_FILE_LIMITS,fail} from './calendar-job-core.mjs';
export const JOB_BUCKET='xtreme-avatar-job-files';
const OBJECT=/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/ce1_[0-9a-f]{64}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;
export function createJobStorage({url,serverKey,fetcher=fetch}){
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||'')||typeof serverKey!=='string'||!serverKey)return null;
 const headers={'authorization':'Bearer '+serverKey,'apikey':serverKey};
 const endpoint=name=>{if(!OBJECT.test(name||''))throw Error('Invalid private object');return url+'/storage/v1/object/'+JOB_BUCKET+'/'+name;};
 async function fetchObject(name,options){const response=await fetcher(endpoint(name),{...options,headers:{...headers,...options.headers},redirect:'manual',cache:'no-store',signal:options.signal?AbortSignal.any([AbortSignal.timeout(20000),options.signal]):AbortSignal.timeout(20000)});if(!response.ok||response.status>=300){try{await response.body?.cancel();}catch{}throw Error('Private storage unavailable');}return response;}
 return {
  async put(name,bytes,mime,options={}){if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>JOB_FILE_LIMITS.fileBytes||!JOB_FILE_LIMITS.mimeTypes.includes(mime))throw Error('Invalid private file');const response=await fetchObject(name,{signal:options.signal,method:'POST',headers:{'content-type':mime,'x-upsert':'false','cache-control':'no-store'},body:bytes});await response.body?.cancel();},
  async get(name,options={}){const response=await fetchObject(name,{method:'GET',signal:options.signal});const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>JOB_FILE_LIMITS.fileBytes){await response.body?.cancel();throw Error('Invalid private file');}const reader=response.body?.getReader();if(!reader)throw Error('Missing private file');const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>JOB_FILE_LIMITS.fileBytes){await reader.cancel();throw Error('Invalid private file');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;},
  async remove(name,options={}){endpoint(name);options.signal?.throwIfAborted();const response=await fetcher(url+'/storage/v1/object/'+JOB_BUCKET,{method:'DELETE',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({prefixes:[name]}),redirect:'manual',cache:'no-store',signal:options.signal?AbortSignal.any([AbortSignal.timeout(20000),options.signal]):AbortSignal.timeout(20000)});if(!response.ok){try{await response.body?.cancel();}catch{}throw Error('Private removal unavailable');}await response.body?.cancel();}
 };
}

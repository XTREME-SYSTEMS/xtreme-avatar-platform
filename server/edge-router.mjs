import {handleAccounts,jsonResponse,requireMember} from "./accounts.mjs";
import {handleCalendarJob} from './calendar-jobs.mjs';
import {JOB_PATHS,JOB_FILE_LIMITS} from './calendar-job-core.mjs';
import {handleWorkHub} from "./work-hub.mjs";
import {handleAssistant} from "./assistant.mjs";
import {handleCommunications} from "./communications.mjs";
import {handleCallDeskLink} from "./call-desk-link.mjs";
const PATHS=new Set([...JOB_PATHS,
 "/api/account","/api/account/state","/api/team","/api/runtime-session",
 "/api/work-hub","/api/work-hub/jobs","/api/work-hub/results",
 "/api/assistant/status","/api/assistant/chat",
 "/api/assistant/voice/status","/api/assistant/voice/start","/api/assistant/voice/end",
 "/api/communications","/api/call-desk-link/status","/api/call-desk-link/initiate",
 "/api/call-desk-link/complete","/api/call-desk-link/disconnect"
]);
export function allowedOrigins(value) {
 return new Set(String(value||"").split(",").map(v=>v.trim()).filter(v=>{
  try {const u=new URL(v);return u.origin===v&&u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}
 }));
}
export async function routeEdgeRequest(request,dependencies) {
 const origins=allowedOrigins(dependencies.allowedOrigins);
 const origin=request.headers.get("origin");
 const cors=origin&&origins.has(origin)?{
  "access-control-allow-origin":origin,"vary":"Origin",
  "access-control-allow-methods":"GET,POST,OPTIONS",
  "access-control-allow-headers":"authorization,apikey,content-type,x-xtreme-account,x-xtreme-connection-revision,idempotency-key",
  "access-control-max-age":"600"
 }:{};
 const respond=(data,status)=>jsonResponse(data,status);
 let response;
 try{
  if(!origin||!origins.has(origin))return respond({error:"This app origin is not enabled."},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(!["GET","POST"].includes(request.method))response=respond({error:"Method not allowed."},405);
  else{
   const url=new URL(request.url);
   // Supabase gateways may strip /functions/v1 before invoking the function.
   // Only these exact function prefixes are accepted; lookalike names stay 404.
   const prefix=["/functions/v1/xtreme-avatar-api","/xtreme-avatar-api"].find(value=>url.pathname.startsWith(value+"/"));
   const path=prefix?url.pathname.slice(prefix.length):url.pathname;
   if(!PATHS.has(path))response=respond({error:"Not found."},404);
   else{
    const authorization=request.headers.get("authorization")||"";
    const match=/^Bearer ([^\s]+)$/.exec(authorization);
    if(!match)response=respond({error:"Sign in to your account."},401);
    else{
     const user=await dependencies.verifyUser(match[1]);
     if(!user?.id||!user.email||!user.email_confirmed_at||user.is_anonymous===true)response=respond({error:"A verified account is required."},401);
     else{
      let bytes;
      if(request.method==="POST"){
       const reader=request.body?.getReader();let size=0;const chunks=[];
       if(!reader)throw Object.assign(new Error("Request body is required."),{status:400});
       while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>(path==="/api/calendar/job-files/upload"?JOB_FILE_LIMITS.fileBytes:131072)){await reader.cancel();throw Object.assign(new Error("Request is too large."),{status:413});}chunks.push(value);}
       bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
      }
      // Construct fresh headers: never carry platform identity headers, cookies,
      // provider keys or user-controlled proxy destination metadata.
      const headers=new Headers({origin});
      for(const name of ["content-type","x-xtreme-account","x-xtreme-connection-revision","idempotency-key"]){const v=request.headers.get(name);if(v)headers.set(name,v);}
      const forwarded=new Request(origin+path+url.search,{method:request.method,headers,body:bytes,signal:request.signal});
      const env={
       DB:dependencies.databaseFor(user),AUTH_USER:Object.freeze({...user}),
       ACCESS_TOKEN:match[1],APP_ORIGIN:origin,MIGRATED_IDENTITY:true,
       VOICE_V2_ENABLED:dependencies.voiceEnabled===true,
       CHAT_V2_ENABLED:dependencies.chatEnabled===true,FILE_STORAGE:dependencies.fileStorage??null
      };
      if(path==="/api/runtime-session"){
       if(request.method!=="GET")response=respond({error:"Method not allowed."},405);
       else{
        const member=await requireMember(forwarded,env);
        response=respond({user:{id:member.user_id,role:member.role,status:member.status},
         organizationId:member.organization_id,
         entitlements:{browser_voice:env.VOICE_V2_ENABLED===true,assistant_chat:env.CHAT_V2_ENABLED===true,google_workspace:true}},200);
       }
      }
      else if(JOB_PATHS.includes(path))response=await handleCalendarJob(forwarded,env,{fetcher:dependencies.fetcher,resolveBinding:dependencies.resolveCalendarBinding});
      else if(path.startsWith("/api/assistant/"))response=await handleAssistant(forwarded,env,dependencies.fetcher);
      else if(path==="/api/communications")response=await handleCommunications(forwarded,env);
      else if(path.startsWith("/api/call-desk-link/"))response=await handleCallDeskLink(forwarded,env,dependencies.fetcher);
      else if(path.startsWith("/api/work-hub"))response=await handleWorkHub(forwarded,env);
      else response=await handleAccounts(forwarded,env);
     }
    }
   }
  }
 }catch(error){response=respond({error:error.status?error.message:"The account service is temporarily unavailable."},error.status||503);}
 const headers=new Headers(response.headers);for(const [key,value]of Object.entries(cors))headers.set(key,value);
 headers.set("cache-control","private, no-store");
 return new Response(response.body,{status:response.status,headers});
}

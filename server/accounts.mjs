import { validAvatarId, validAssistantPreferences } from './assistant-preferences.mjs';
import { validAssistantControls } from './assistant-controls.mjs';
const ROLES=['owner','admin','member'];
const KEYS=['profile','model','assistant_preferences','assistant_controls','draft','contacts','plans','transcript','assistant_chat_draft'];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff'}});
const fail=(status,message,code)=>{throw Object.assign(new Error(message),{status,code});};
const str=(s,max)=>typeof s==='string'&&s.length<=max;
const emailOf=s=>String(s||'').trim().toLowerCase();
const emailOK=s=>str(s,254)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const phone=s=>str(s,24)&&/^\+?[0-9]{7,15}$/.test(s);
function validateValue(key,v){
 let ok=false;
 if(key==='profile')ok=v&&str(v.name,40)&&Object.keys(v).length===1;
 if(key==='model')ok=validAvatarId(v);
 if(key==='assistant_preferences')ok=validAssistantPreferences(v);
 if(key==='assistant_controls')ok=validAssistantControls(v);
 if(key==='draft')ok=v&&str(v.to,100)&&str(v.body,3000)&&['SMS','MMS','WhatsApp'].includes(v.channel)&&Object.keys(v).length===3;
 if(key==='transcript')ok=str(v,10000);
 if(key==='assistant_chat_draft')ok=str(v,4000);
 if(key==='contacts')ok=Array.isArray(v)&&v.length<=100&&v.every(c=>c&&str(c.id,80)&&str(c.name,60)&&phone(c.phone)&&Object.keys(c).length===3)&&new Set(v.map(c=>c.id)).size===v.length;
 if(key==='plans')ok=Array.isArray(v)&&v.length<=30&&v.every(p=>p&&str(p.id,80)&&str(p.kind,80)&&str(p.details,10000)&&str(p.created,40)&&Array.isArray(p.numbers)&&p.numbers.length<=100&&p.numbers.every(phone)&&Object.keys(p).length===5);
 if(!ok||JSON.stringify(v).length>120000)fail(400,'Invalid account data.');
}
async function body(request){
 if(request.headers.get('origin')!==new URL(request.url).origin)fail(403,'This request must come from Xtreme Avatar.');
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'JSON is required.');
 if(Number(request.headers.get('content-length'))>131072)fail(413,'Request is too large.');
 const reader=request.body?.getReader();if(!reader)fail(400,'Request body is required.');let size=0,chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072){await reader.cancel();fail(413,'Request is too large.');}chunks.push(value);}
 const all=new Uint8Array(size);let n=0;for(const chunk of chunks){all.set(chunk,n);n+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(all));}catch{fail(400,'Invalid JSON.');}
}
async function member(request,env){
 // Only the Edge authentication boundary can supply this object. Never infer
 // identity, company membership, or authority from inbound platform headers.
 const verified=env.AUTH_USER,id=verified?.id,email=emailOf(verified?.email);
 if(!id||!emailOK(email)||verified.is_anonymous===true||!verified.email_confirmed_at)fail(401,'Sign in to your verified account.');
 if(!env.DB)fail(503,'Account storage is unavailable.');
 let row=await env.DB.prepare('SELECT * FROM members WHERE user_id=?').bind(id).first();
 if(!row){
  if(typeof env.DB.admitVerifiedMember!=='function')fail(503,'Account admission is unavailable.');
  await env.DB.admitVerifiedMember();
  row=await env.DB.prepare('SELECT * FROM members WHERE user_id=?').bind(id).first();
 }
 if(!row||row.status!=='active'||!ROLES.includes(row.role))fail(403,'Account access is paused or has not been invited. Contact your administrator.');
 // Existing membership is never recreated or regranted by a bootstrap email.
 if(request.method!=='GET'&&request.headers.get('x-xtreme-account')!==row.user_id)fail(409,'Your signed-in account changed. Reload before saving.','account_changed');
 return row;
}
export { member as requireMember, body as readBody, json as jsonResponse };
const publicMember=m=>({id:m.user_id,email:m.email,role:m.role,status:m.status});
async function audit(db,actor,action,target){if(db.authorityAuditAtomic===true)return;await db.prepare('INSERT INTO account_audit (actor_id,action,target,created_at) VALUES (?,?,?,?)').bind(actor,action,target,new Date().toISOString()).run();}
export async function handleAccounts(request,env){
 try{
  const path=new URL(request.url).pathname;
  if(!['/api/account','/api/account/state','/api/team'].includes(path))return json({error:'Not found.'},404);
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed.'},405);
  const input=request.method==='POST'?await body(request):null;
  const user=await member(request,env),db=env.DB;
  if(path==='/api/account'&&request.method==='GET'){
   const rows=await db.prepare('SELECT key,value,version FROM private_state WHERE user_id=?').bind(user.user_id).all();
   const data={},versions={};for(const row of rows.results){if(KEYS.includes(row.key)){data[row.key]=JSON.parse(row.value);versions[row.key]=row.version;}}
   return json({user:publicMember(user),data,versions});
  }
  if(path==='/api/account/state'&&request.method==='POST'){
   if(!input||Object.keys(input).sort().join(',')!=='key,value,version'||!KEYS.includes(input.key)||!Number.isSafeInteger(input.version)||input.version<0)fail(400,'Invalid save request.');
   validateValue(input.key,input.value);
   const payload=JSON.stringify(input.value),now=new Date().toISOString();
   const result=input.version===0
    ?await db.prepare('INSERT OR IGNORE INTO private_state (user_id,key,value,version,updated_at) SELECT ?,?,?,1,? WHERE EXISTS (SELECT 1 FROM members WHERE user_id=? AND status=\'active\')').bind(user.user_id,input.key,payload,now,user.user_id).run()
    :await db.prepare('UPDATE private_state SET value=?,version=version+1,updated_at=? WHERE user_id=? AND key=? AND version=? AND EXISTS (SELECT 1 FROM members WHERE user_id=? AND status=\'active\')').bind(payload,now,user.user_id,input.key,input.version,user.user_id).run();
   if(result.meta.changes!==1)fail(409,'This item changed in another session, or access changed. Reload before editing.');
   return json({saved:true,version:input.version+1});
  }
  if(path==='/api/team'){
   if(!['admin','owner'].includes(user.role))fail(403,'Administrator access is required.');
   if(request.method==='GET'){
    const members=await db.prepare('SELECT user_id,email,role,status FROM members ORDER BY created_at LIMIT 500').all();
    const invitations=await db.prepare('SELECT email,role,status FROM invitations WHERE email NOT IN (SELECT email FROM members) ORDER BY created_at LIMIT 500').all();
    return json({members:members.results.map(publicMember),invitations:invitations.results});
   }
   if(input?.action==='invite'){
    if(Object.keys(input).sort().join(',')!=='action,email,role')fail(400,'Invalid invitation.');
    const email=emailOf(input.email),role=input.role;
    if(!emailOK(email)||!['member','admin'].includes(role)||(role==='admin'&&user.role!=='owner'))fail(400,'Choose a valid member role and email.');
    if([emailOf(env.XTREME_OWNER_EMAIL),emailOf(env.XTREME_ADMIN_EMAIL)].includes(email))fail(409,'This account is already reserved.');
    const existing=await db.prepare('SELECT user_id FROM members WHERE email=?').bind(email).first();if(existing)fail(409,'This person is already a member.');
    const prior=await db.prepare('SELECT role FROM invitations WHERE email=?').bind(email).first();if(prior?.role==='admin'&&user.role!=='owner')fail(403,'Only the owner can change an administrator invitation.');
    const count=await db.prepare('SELECT (SELECT COUNT(*) FROM members)+(SELECT COUNT(*) FROM invitations) AS total').first();if(count.total>=500)fail(409,'The membership limit has been reached.');
    const result=await db.prepare('INSERT INTO invitations (email,role,status,created_at) SELECT ?,?,\'active\',? WHERE EXISTS (SELECT 1 FROM members WHERE user_id=? AND role=? AND status=\'active\') ON CONFLICT(email) DO UPDATE SET role=excluded.role,status=excluded.status WHERE (?=\'owner\' OR invitations.role=\'member\') AND EXISTS (SELECT 1 FROM members WHERE user_id=? AND role=? AND status=\'active\')').bind(email,role,new Date().toISOString(),user.user_id,user.role,user.role,user.user_id,user.role).run();
    if(result.meta.changes!==1)fail(403,'Membership permissions changed. Reload before continuing.');
    await audit(db,user.user_id,'invite',email);
    return json({saved:true,message:'Member approved. Share the app link so they can sign in with the approved, verified email. No email was sent by this action.'});
   }
   if(input?.action==='update'){
    if(Object.keys(input).sort().join(',')!=='action,id,role,status')fail(400,'Invalid membership change.');
    const target=await db.prepare('SELECT * FROM members WHERE user_id=?').bind(input.id).first();
    if(!target)fail(404,'Member not found.');
    if(target.role==='owner'||target.user_id===user.user_id||(user.role==='admin'&&target.role!=='member'))fail(403,'You cannot change this account.');
    if(!['member','admin'].includes(input.role)||!['active','suspended'].includes(input.status)||(user.role==='admin'&&input.role!=='member'))fail(403,'This role change is not allowed.');
    const result=await db.prepare('UPDATE members SET role=?,status=? WHERE user_id=? AND role!=\'owner\' AND (?=\'owner\' OR role=\'member\') AND EXISTS (SELECT 1 FROM members AS actor WHERE actor.user_id=? AND actor.role=? AND actor.status=\'active\')').bind(input.role,input.status,target.user_id,user.role,user.user_id,user.role).run();
    if(result.meta.changes!==1)fail(403,'Membership permissions changed. Reload before continuing.');
    await audit(db,user.user_id,'membership_update',target.user_id);
    return json({saved:true});
   }
   if(input?.action==='revoke_invite'){
    if(Object.keys(input).sort().join(',')!=='action,email')fail(400,'Invalid invitation change.');
    const email=emailOf(input.email),target=await db.prepare('SELECT role FROM invitations WHERE email=?').bind(email).first();
    if(!target)fail(404,'Invitation not found.');if(user.role!=='owner'&&target.role!=='member')fail(403,'Only the owner can change this invitation.');
    const result=await db.prepare('UPDATE invitations SET status=\'revoked\' WHERE email=? AND (?=\'owner\' OR role=\'member\') AND EXISTS (SELECT 1 FROM members WHERE user_id=? AND role=? AND status=\'active\')').bind(email,user.role,user.user_id,user.role).run();if(result.meta.changes!==1)fail(403,'Membership permissions changed. Reload before continuing.');await audit(db,user.user_id,'invite_revoked',email);return json({saved:true});
   }
  }
  return json({error:'Method not allowed.'},405);
 }catch(error){return json({error:error.status?error.message:'Account service is temporarily unavailable.',...(error.code?{code:error.code}:{})},error.status||503);}
}

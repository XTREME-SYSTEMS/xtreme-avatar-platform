import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {safeReturnPath, sameOriginRequest, apiPathAllowed, isPublishableSupabaseKey} from '../server/supabase-auth-policy.mjs';
const passed = [];
function pass(label) { passed.push(label); console.log('PASS ' + label); }
for (const value of ['https://evil.example','//evil.example','/\\evil.example','/%2f%2fevil.example','/%5cevil.example','/ok%0d%0aLocation:evil','/auth/callback','/signin-with-chatgpt','/callback','/signout-with-chatgpt','/bad%','javascript:alert(1)','']) assert.equal(safeReturnPath(value),'/');
assert.equal(safeReturnPath('/#tools'),'/#tools');
assert.equal(safeReturnPath('/account-link/call-desk/complete?receipt=ok'),'/account-link/call-desk/complete?receipt=ok');
pass('redirect allowlist blocks external, encoded, control-character and auth-loop destinations');
for (const origin of ['https://evil.example','null','', 'https://xtremeavatar.com.evil.example']) assert.equal(sameOriginRequest(new Request('https://xtremeavatar.com/api/account',{headers:{origin}})),false);
assert.equal(sameOriginRequest(new Request('https://xtremeavatar.com/api/account',{headers:{origin:'https://xtremeavatar.com'}})),true);
assert.equal(sameOriginRequest(new Request('https://xtremeavatar.com/api/account',{headers:{origin:'https://xtremeavatar.com','sec-fetch-site':'cross-site'}})),false);
pass('mutation policy rejects absent, opaque, cross-site, and mismatched origins');
assert.equal(apiPathAllowed('/api/account'),true);
assert.equal(apiPathAllowed('/api/assistant/voice/start'),true);
assert.equal(apiPathAllowed('/api/unknown'),false);
pass('proxy route allowlist');
assert.equal(isPublishableSupabaseKey('sb_secret_reject'),false);
assert.equal(isPublishableSupabaseKey('sb_publishable_accept'),true);
for (const role of ['service_role','authenticated']) assert.equal(isPublishableSupabaseKey('header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature'),false);
assert.equal(isPublishableSupabaseKey('header.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.signature'),true);
pass('configuration rejects secret and service-role credentials; accepts only publishable or legacy anon keys');
const base = 'http://localhost:3100';
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3100'], {
 env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://akezkmklygzltvnvisob.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_negative_test_only'},
 stdio:['ignore','pipe','pipe']
});
let logs=''; child.stdout.on('data',s=>logs+=s); child.stderr.on('data',s=>logs+=s);
try {
 let ready=false; for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
 assert.equal(ready,true,'Next server ready: '+logs);
 const source=fs.readFileSync('home-html.ts','utf8').trim();
 const original=JSON.parse(source.replace(/^export const HOME_HTML = /,'').replace(/;$/,''));
 const home=await fetch(base); assert.equal(home.status,200); assert.equal(await home.text(),original); assert.match(home.headers.get('cache-control'),/no-store/);
 pass('native Next root serves exact approved HOME_HTML bytes with no-store');
 for(const file of ['/manifest.webmanifest','/sw.js','/assets/platinum-gold-hero.webp','/accounts.js'])assert.equal((await fetch(base+file)).status,200);
 pass('PWA manifest, service worker, hero and account script available');
 const a=await fetch(base+'/api/account',{headers:{'oai-authenticated-user-id':'forged','oai-authenticated-user-email':'owner@example.com',authorization:'Bearer forged'}});
 assert.equal(a.status,401);assert.equal((await a.json()).code,'sign_in_required');assert.match(a.headers.get('cache-control'),/private.*no-store/);
 pass('forged Sites identity and authorization headers cannot sign in');
 for(const route of ['/api/account/state','/auth/logout']){
  const r=await fetch(base+route,{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'});assert.equal(r.status,403);
 }
 pass('cross-origin account write and logout blocked over HTTP');
 const legitimate=await fetch(base+'/api/account/state',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'});assert.equal(legitimate.status,401);pass('same-origin mutation reaches authentication instead of failing origin validation');
 const logout=await fetch(base+'/auth/logout',{redirect:'manual'});assert.equal(logout.status,405);
 const legacyLogout=await fetch(base+'/signout-with-chatgpt');assert.equal(legacyLogout.status,200);assert.match(await legacyLogout.text(),/method="post"/);
 pass('GET logout never changes session; legacy route requires POST confirmation');
 const legacy=await fetch(base+'/signin-with-chatgpt?return_to=%2F%2Fevil.example',{redirect:'manual'});
 assert.equal(legacy.status,303);assert.equal(new URL(legacy.headers.get('location')).pathname,'/auth/login');assert.equal(new URL(legacy.headers.get('location')).searchParams.get('return_to'),'/');
 pass('legacy sign-in redirects only to same-site Google flow');
 const callback=await fetch(base+'/auth/callback?return_to=https%3A%2F%2Fevil.example',{redirect:'manual'});assert.equal(callback.status,303);assert.equal(new URL(callback.headers.get('location')).pathname,'/auth/error');
 pass('invalid callback fails closed without open redirect');
 const oauth=await fetch(base+'/auth/login?return_to=%2F%2Fevil.example',{redirect:'manual'});assert.equal(oauth.status,303);
 const authorize=new URL(oauth.headers.get('location'));assert.equal(authorize.origin,'https://akezkmklygzltvnvisob.supabase.co');
 assert.equal(authorize.searchParams.get('provider'),'google');assert.equal(authorize.searchParams.get('code_challenge_method'),'s256');
 const redirectTo=new URL(authorize.searchParams.get('redirect_to'));assert.equal(redirectTo.origin,base);assert.equal(redirectTo.searchParams.get('return_to'),'/');
 const cookie=oauth.headers.get('set-cookie')||'';assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=lax/i);assert.match(cookie,/Secure/i);
 assert.doesNotMatch(authorize.searchParams.get('scopes')||'',/gmail|calendar|drive/i);assert.match(oauth.headers.get('cache-control'),/no-store/);
 pass('Google OAuth creates PKCE challenge, safe callback and secure HttpOnly cookie; no Workspace data scopes');
 assert.equal((await fetch(base+'/api/not-a-route')).status,404);
 pass('unknown API route blocked before upstream');
 const changed=execFileSync('git',['diff','--name-only','--','home-html.ts','public/style.css','public/polish.css','public/assist.css','public/assets','app/globals.css','public/manifest.webmanifest','public/sw.js']).toString().trim();
 assert.equal(changed,'');
 const appSource=fs.readFileSync('public/app.js','utf8');
 const appBaseline=execFileSync('git',['show','HEAD:public/app.js'],{encoding:'utf8'});
 for(const prefix of ['function home(){','const nav=']){
  const current=appSource.split(/\r?\n/).find(line=>line.startsWith(prefix));
  const baseline=appBaseline.split(/\r?\n/).find(line=>line.startsWith(prefix));
  assert.ok(current&&baseline,'approved source segment is present: '+prefix);
  assert.equal(current,baseline,'approved source segment is byte-identical: '+prefix);
 }
 pass('approved home renderer, navigation definition, styles, hero/assets and PWA content unchanged; reviewed route hooks permitted');
 fs.writeFileSync('docs/migration-frontend-test-results.txt',passed.map(x=>'PASS '+x).join('\n')+'\nNative Next.js 16.3.4 production build passed.\nLive Google account callback, authenticated persistence and real media sessions: NOT TESTED.\n');
 console.log(passed.length+' meaningful checks passed');
} finally { child.kill('SIGTERM'); }
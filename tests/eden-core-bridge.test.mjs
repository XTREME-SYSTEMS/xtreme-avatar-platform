import test from 'node:test';
import assert from 'node:assert/strict';
import {callEdenCore, EDEN_CORE_STAGING_ORIGIN} from '../server/eden-core-bridge.mjs';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SECRET = ['a'.repeat(24), 'b'.repeat(30), 'c'.repeat(32)].join('.');
const ENV = Object.freeze({
  EDEN_CORE_BRIDGE_ENABLED:'true',
  EDEN_CORE_XTREME_OWNER_ID:OWNER,
  EDEN_CORE_ACCESS_TOKEN:SECRET
});
const answer = (body, status = 200) => Response.json(body, {status});
const input = {text:'Hello Eden',requestKey:'request_123456789'};
test('disabled, missing owner mapping, wrong owner and missing grant deny before network', async () => {
  let calls = 0;
  const fetcher = async () => {calls++; throw Error('should not call network');};
  await assert.rejects(callEdenCore({action:'status',userId:OWNER,env:{...ENV,EDEN_CORE_BRIDGE_ENABLED:'false'},fetcher}),e=>e.code==='core_not_connected');
  await assert.rejects(callEdenCore({action:'status',userId:OWNER,env:{...ENV,EDEN_CORE_XTREME_OWNER_ID:'unknown'},fetcher}),e=>e.code==='core_identity_unmapped');
  await assert.rejects(callEdenCore({action:'status',userId:OTHER,env:ENV,fetcher}),e=>e.code==='core_owner_required');
  await assert.rejects(callEdenCore({action:'status',userId:OWNER,env:{...ENV,EDEN_CORE_ACCESS_TOKEN:'not-a-jwt'},fetcher}),e=>e.code==='core_grant_missing');
  assert.equal(calls,0);
});
test('read-only status is fixed-origin and returns only bounded readiness metadata', async () => {
  let observed;
  const result = await callEdenCore({action:'status',userId:OWNER,env:ENV,fetcher:async (url, init)=>{
    observed={url,init};return answer({revision:12,profile:{private:'DO NOT LEAK'}});
  }});
  assert.equal(observed.url, EDEN_CORE_STAGING_ORIGIN+'/v1/profile');
  assert.equal(observed.init.method,'GET');
  assert.equal(observed.init.redirect,'manual');
  assert.equal(observed.init.headers.authorization,'Bearer '+SECRET);
  assert.equal(observed.init.body,undefined);
  assert.equal(result.connected,true);
  assert.equal(result.profileRevision,12);
  assert.equal(JSON.stringify(result).includes('DO NOT LEAK'),false);
  assert.equal(result.liveChatTested,false);
});
test('chat forwards only exact bounded text and request key, no tenant or destination input',async()=>{
  let sent;
  const result=await callEdenCore({action:'chat',userId:OWNER,env:ENV,input,fetcher:async (url,init)=>{
    sent={url,init};return answer({status:'completed',text:'Hello from Core',id:'opaque'});
  }});
  assert.equal(sent.url,EDEN_CORE_STAGING_ORIGIN+'/v1/chat');
  assert.equal(sent.init.method,'POST');
  assert.deepEqual(JSON.parse(sent.init.body),input);
  assert.equal(result.reply,'Hello from Core');
  assert.equal(result.requestKey,input.requestKey);
});
test('invalid bodies and attacker-selected endpoints are rejected before network',async()=>{
  const invalid=[{...input, url:'https://evil.invalid'},{...input,tenantId:OTHER},
    {text:'\u0000bad',requestKey:input.requestKey},{text:' ',requestKey:input.requestKey},
    {text:'x'.repeat(4001),requestKey:input.requestKey},{text:'hi',requestKey:'short'}];
  for(const item of invalid)await assert.rejects(callEdenCore({action:'chat',userId:OWNER,env:ENV,input:item,fetcher:()=>{throw Error('network');}}),e=>e.code==='core_invalid_message');
});
test('Core rejects grants and never echoes upstream body or the signing token',async()=>{
  for(const status of [401,403]){
    await assert.rejects(callEdenCore({action:'status',userId:OWNER,env:ENV,fetcher:()=>answer({error:SECRET},status)}),e=>{
      assert.equal(e.code,'core_grant_rejected');assert.equal(e.message.includes(SECRET),false);return true;
    });
  }
});
test('unknown outcomes and transport errors do not automatically redispatch',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return answer({status:'unknown',text:null});};
  const result=await callEdenCore({action:'chat',userId:OWNER,env:ENV,input,fetcher});
  assert.equal(result.reply,null);assert.equal(result.reconciliationRequired,true);assert.equal(calls,1);
  await assert.rejects(callEdenCore({action:'chat',userId:OWNER,env:ENV,input,fetcher:async()=>{throw Error(SECRET);}}),e=>{
    assert.equal(e.code,'core_outcome_unknown');assert.equal(e.message.includes(SECRET),false);return true;
  });
});
test('oversized and non-JSON receipts cannot be trusted',async()=>{
  await assert.rejects(callEdenCore({action:'status',userId:OWNER,env:ENV,fetcher:()=>answer({revision:2,profile:{payload:'x'.repeat(66000)}})}),e=>e.code==='core_invalid_receipt');
  await assert.rejects(callEdenCore({action:'status',userId:OWNER,env:ENV,fetcher:()=>new Response('<html>',{headers:{'content-type':'text/html'}})}),e=>e.code==='core_invalid_receipt');
});

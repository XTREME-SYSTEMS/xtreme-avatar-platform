import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleWorkHub } from '../server/work-hub.mjs';

export const ORIGIN='https://xtreme.example.test';
export function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_unknown_blazing_skull.sql',import.meta.url),'utf8'));
 for(const id of ['alice','bob'])sqlite.prepare("INSERT INTO members(user_id,email,role,status,created_at) VALUES(?,?,'member','active','2026-11-07')").run(id,id+'@example.test');
 let beforeRun=null;
 function statement(sql,args=[]){return {bind(...next){return statement(sql,next);},async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){beforeRun?.(sql,args);const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}
 const env={DB:{prepare:statement}};
 async function raw(user,path='/api/work-hub?day=2026-11-07',input,extra={}){return handleWorkHub(new Request(ORIGIN+path,{method:input===undefined?'GET':'POST',headers:{...(user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test','x-xtreme-account':user}:{}),...(input===undefined?{}:{origin:ORIGIN,'content-type':'application/json'}),...extra},body:input===undefined?undefined:JSON.stringify(input)}),{...env,AUTH_USER:user?{id:user,email:user+'@example.test',email_confirmed_at:'2026-11-07T00:00:00Z',is_anonymous:false}:null});}
 async function request(...args){const r=await raw(...args);return {status:r.status,body:await r.json(),headers:r.headers};}
 return {sqlite,env,raw,request,setBeforeRun(fn){beforeRun=fn;}};
}

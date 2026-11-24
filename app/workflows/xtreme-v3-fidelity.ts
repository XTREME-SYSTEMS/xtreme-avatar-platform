/**
 * Durable read-only Xtreme Avatar preview health check, no provider writes.
 * One invocation per scheduled executionId. Never alters production.
 */
type Probe = {
  status:'PASS'|'BLOCKED_AUTH'|'FAILED'|'SKIP_NON_PREVIEW';
  branch:string;commit:string;host:string;
  checks:{path:string;code:number;present:boolean;reason?:string}[];
};
const paths=[
 '/xtreme-v3/index.html',
 '/xtreme-v3/fidelity.css',
 '/xtreme-v3/assets/precision-brush-v4.svg',
 '/xtreme-v3/assets/silver-beams-v4.svg'
] as const;
async function inspect():Promise<Probe>{
  'use step';
  const branch=process.env.VERCEL_GIT_COMMIT_REF??'unknown';
  const commit=process.env.VERCEL_GIT_COMMIT_SHA??'unknown';
  if(process.env.VERCEL_ENV!=='preview')
    return {status:'SKIP_NON_PREVIEW',branch,commit,host:'none',checks:[]};
  const host=process.env.VERCEL_URL??'';
  if(!/^[a-z0-9-]+\.vercel\.app$/i.test(host)||!host.startsWith('xtreme-avatar-v0-migration-'))
    return {status:'FAILED',branch,commit,host:'invalid',checks:[]};
  const headers:Record<string,string>={};
  const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if(bypass)headers['x-vercel-protection-bypass']=bypass;
  const checks:Probe['checks']=[];
  for(const path of paths){
    try{
      const res=await fetch(`https://${host}${path}`,{
        method:'GET',headers,cache:'no-store',redirect:'manual',
        signal:AbortSignal.timeout(7000)
      });
      let present=res.ok;
      if(present&&path.endsWith('/index.html')){
        const html=(await res.text()).slice(0,24000);
        present=html.includes('XTREME AVATAR')&&html.includes('XPS INTELLIGENCE');
      }
      if(present&&path.endsWith('/fidelity.css')){
        const css=(await res.text()).slice(-34000);
        present=css.includes('V5 DESIGN LOCK')&&css.includes('V5.2 / Windows + Linux narrow-screen clearance');
      }
      checks.push({path,code:res.status,present});
    }catch(error){
      const reason = error instanceof Error ? error.name : 'UnknownError';
      checks.push({path,code:0,present:false,reason});
    }
  }
  const blocked=checks.length>0&&checks.every(c=>[301,302,303,307,308,401,403].includes(c.code));
  return {
    status:blocked?'BLOCKED_AUTH':checks.every(c=>c.present)?'PASS':'FAILED',
    branch,commit,host,checks
  };
}
export async function xtremeV3FidelityWorkflow(executionId:string,scheduledAt:string){
  'use workflow';
  const result=await inspect();
  console.info(JSON.stringify({
    kind:'xtreme-v3-fidelity-v1',executionId,scheduledAt,
    result:result.status,branch:result.branch,commit:result.commit,checks:result.checks
  }));
  return {executionId,scheduledAt,...result};
}

// Server-only compatibility layer. SQL comes exclusively from reviewed modules,
// never from HTTP input. Each statement commits separately, preserving durable
// compare-and-swap reservations before external provider work.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOTSTRAP = new Set([
 "CREATE TABLE IF NOT EXISTS assistant_turns (user_id TEXT NOT NULL, request_id TEXT NOT NULL, prompt TEXT NOT NULL, context_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','complete','failed')), reply TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,request_id))",
 "CREATE UNIQUE INDEX IF NOT EXISTS assistant_one_pending ON assistant_turns(user_id) WHERE status='pending'"
]);
export function translateSql(input, args=[]) {
 if (BOOTSTRAP.has(input.trim())) return {skip:true,sql:"",args:[]};
 let sql = input.trim();
 const ignore = /^INSERT OR IGNORE INTO\b/i.test(sql);
 sql = sql.replace(/^INSERT OR IGNORE INTO\b/i,"INSERT INTO");
 if (!/^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) throw new Error("Unsupported internal SQL");
 let output="",quote=null,count=0;
 for(let i=0;i<sql.length;i++) {
  const c=sql[i];
  if(quote) {
   output+=c;
   if(c===quote){if(sql[i+1]===quote){output+=sql[++i];}else quote=null;}
  } else if(c==="'"||c==='"'){quote=c;output+=c;}
  else if(c==="?"){output+="$"+(++count);}
  else if(c===";"|| (c==="-"&&sql[i+1]==="-") || (c==="/"&&sql[i+1]==="*") || c==="$") throw new Error("Multiple statements, comments and dollar SQL are not supported");
  else output+=c;
 }
 if(quote||count!==args.length)throw new Error("Invalid internal SQL bindings");
 if(ignore)output+=" ON CONFLICT DO NOTHING";
 return {sql:output,args,skip:false};
}
export function createD1Adapter(client,user) {
 if(!user||!UUID.test(user.id)||user.is_anonymous===true)throw new Error("Verified non-anonymous user required");
 const claims=JSON.stringify({sub:user.id,role:"authenticated",email:user.email||"",is_anonymous:false});
 const transaction=callback=>client.begin(async sql=>{
  await sql.unsafe("SET LOCAL ROLE authenticated");
  await sql.unsafe("SELECT set_config('request.jwt.claims', $1, true)",[claims]);
  await sql.unsafe("SET LOCAL search_path TO xtreme_avatar, pg_catalog");
  await sql.unsafe("SET LOCAL statement_timeout = '10s'");
  return callback(sql);
 });
 function prepare(input,args=[]) {
  const execute=()=>{const translated=translateSql(input,args);return translated.skip?Promise.resolve([]):transaction(sql=>sql.unsafe(translated.sql,translated.args));};
  return {
   bind(...values){return prepare(input,values);},
   async first(column){const row=(await execute())[0]??null;return column&&row?row[column]:row;},
   async all(){return {results:Array.from(await execute()),success:true};},
   async run(){const rows=await execute();return {success:true,meta:{changes:Number(rows.count??0)}};}
  };
 }
 // No supplied identity/email/role parameters. DB rechecks auth.users, invitation,
 // and membership in one transaction, with an audit receipt.
 async function admitVerifiedMember(){await transaction(sql=>sql.unsafe("SELECT xtreme_avatar_private.admit_member()"));}
 // Fixed server-only operations use the original trusted DB role, never SQL from HTTP.
 async function fileOperation(operation,input){
  if(!['reserve','claim','finish','delete_begin','delete_finish'].includes(operation))throw new Error('Unsupported file operation');
  return client.begin(async sql=>{
   await sql.unsafe("SELECT set_config('request.jwt.claims', $1, true)",[claims]);
   await sql.unsafe("SET LOCAL search_path TO pg_catalog");
   await sql.unsafe("SET LOCAL statement_timeout = '10s'");
   const rows=await sql.unsafe("SELECT xtreme_avatar_private.file_mutation($1,$2::jsonb) AS result",[operation,JSON.stringify(input)]);
   return rows[0]?.result;
  });
 }
 return {prepare,admitVerifiedMember,fileOperation,authorityAuditAtomic:true};
}

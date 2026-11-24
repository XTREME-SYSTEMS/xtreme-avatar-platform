import {createJobStorage} from "../../../server/job-storage.mjs";
import { deploymentConfig } from "./deployment-config.mjs";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import postgres from "npm:postgres@3.4.7";
import { createD1Adapter } from "../../../server/postgres-d1.mjs";
import { routeEdgeRequest } from "../../../server/edge-router.mjs";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const dbUrl = Deno.env.get("SUPABASE_DB_URL") ?? "";
// Supabase-managed URL stays inside the Edge runtime. No DB URL/service role key
// is exported to Next, the frontend or application responses.
const db = dbUrl ? postgres(dbUrl, { prepare: false, ssl: 'require', max: 1, idle_timeout: 20, connect_timeout: 10 }) : null;
const fileStorage = (Deno.env.get("XTREME_JOB_FILES_ENABLED") ?? String(deploymentConfig.jobFilesEnabled ?? false)) === "true" ? createJobStorage({url,serverKey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}) : null;
Deno.serve((request: Request) => routeEdgeRequest(request, {
 fileStorage,
 allowedOrigins: Deno.env.get("XTREME_ALLOWED_ORIGINS") ?? deploymentConfig.allowedOrigins.join(","),
 voiceEnabled: (Deno.env.get("XTREME_VOICE_V2_ENABLED") ?? String(deploymentConfig.voiceEnabled)) === "true",
 chatEnabled: (Deno.env.get("XTREME_CHAT_V2_ENABLED") ?? String(deploymentConfig.chatEnabled)) === "true",
 async verifyUser(token: string) {
  if (!url || !publicKey) return null;
  const client = createClient(url, publicKey, {
   auth: { persistSession: false, autoRefreshToken: false },
   global: { headers: { Authorization: "Bearer " + token } }
  });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
 },
 databaseFor(user: { id: string }) {
  if (!db) throw new Error("Database is unavailable");
  return createD1Adapter(db, user);
 }
}));

import {authClient,publicSupabaseConfig} from '../../../../server/supabase-auth';
import {createCalendarJobProxy} from '../../../../server/calendar-job-proxy.mjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=120;
const handler=createCalendarJobProxy({authClient,publicConfig:publicSupabaseConfig});
export const GET=handler;
export const POST=handler;

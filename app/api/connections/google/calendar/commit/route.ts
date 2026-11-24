import { authClient } from '../../../../../../server/supabase-auth';
import { createCalendarWorkspaceHandler } from '../../../../../../server/calendar-workspace-proxy.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;
export const POST = createCalendarWorkspaceHandler({authClient});

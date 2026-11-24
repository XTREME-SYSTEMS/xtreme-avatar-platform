import { authClient } from '../../../../../server/supabase-auth';
import { createGoogleWorkspaceHandlers } from '../../../../../server/google-workspace-proxy.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;
const handlers = createGoogleWorkspaceHandlers({authClient});
export const GET = handlers.api;

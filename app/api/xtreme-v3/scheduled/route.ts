/** One Vercel Schedule -> one durable preview-only health workflow. */
import { handleCallback } from '@vercel/queue';
import type { ScheduleQueueMessage } from '@vercel/schedules';
import { start } from 'workflow/api';
import { HookConflictError } from 'workflow/errors';
import { xtremeV3FidelityWorkflow } from '../../../workflows/xtreme-v3-fidelity';

export const runtime = 'nodejs';
const SCHEDULE = 'xtreme-v3-five-minute-preview';
export const POST = handleCallback<ScheduleQueueMessage>(async (message) => {
  if (message.name !== SCHEDULE) throw new Error('XTREME_V3_UNEXPECTED_SCHEDULE');
  if (process.env.VERCEL_ENV !== 'preview') {
    console.warn(JSON.stringify({kind:'xtreme-v3-fidelity',status:'SKIP_NON_PREVIEW'}));
    return;
  }
  if (typeof message.executionId !== 'string' || !/^[A-Za-z0-9._:-]{8,160}$/.test(message.executionId)) {
    throw new Error('XTREME_V3_INVALID_EXECUTION_ID');
  }
  try {
    await start(xtremeV3FidelityWorkflow, [message.executionId, message.scheduledAt], {
      experimental_hook: {
        token: `xtreme-v3-five-minute:${message.executionId}`,
        experimental_minRetention: '7 days',
      },
    });
  } catch (error) {
    if (HookConflictError.is(error)) {
      console.info(JSON.stringify({kind:'xtreme-v3-fidelity',status:'DUPLICATE_IGNORED',executionId:message.executionId}));
      return;
    }
    throw error;
  }
});

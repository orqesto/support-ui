import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabasePauseOnSuccess, handleResponseError } from '../api-client';
import { useDatabaseStatusStore } from '@/stores/databaseStatusStore';
import { useSubscriptionGateStore } from '@/stores/subscriptionGateStore';

const failure = (status: number, data: Record<string, unknown>) => ({
  response: { status, data },
  config: { url: '/api/organizations/onboarding' },
});

beforeEach(() => {
  useDatabaseStatusStore.getState().clear();
  useSubscriptionGateStore.getState().clear();
});

/**
 * Two response codes the interceptor must read by `code`, not by status alone (BYODB Phase 2).
 */
describe('api-client — database-related codes', () => {
  // Free = own database: the wizard's managed choice is refused with a 402. That is a
  // step-level refusal, not "your subscription is not active" — gating the whole app on it
  // would lock a brand-new signup out mid-setup.
  it('does not raise the subscription gate on 402 MANAGED_DB_NOT_ENTITLED', async () => {
    await expect(
      handleResponseError(failure(402, { code: 'MANAGED_DB_NOT_ENTITLED', message: 'Free runs on your own Postgres' }))
    ).rejects.toMatchObject({ status: 402 });
    expect(useSubscriptionGateStore.getState().gated).toBe(false);
  });

  it('still raises the gate on the subscription 402s', async () => {
    await expect(
      handleResponseError(failure(402, { code: 'SUBSCRIPTION_TRIAL_EXPIRED', error: 'Your free trial has expired.' }))
    ).rejects.toMatchObject({ status: 402 });
    expect(useSubscriptionGateStore.getState().gated).toBe(true);
  });

  it('records a DB_* 503 as the workspace being paused, and ignores other 503s', async () => {
    await expect(
      handleResponseError(failure(503, { code: 'DB_UNREACHABLE', error: 'The workspace database is not answering' }))
    ).rejects.toMatchObject({ status: 503 });
    expect(useDatabaseStatusStore.getState().paused).toBe('DB_UNREACHABLE');

    useDatabaseStatusStore.getState().clear();
    await expect(handleResponseError(failure(503, { code: 'AI_NOT_CONFIGURED' }))).rejects.toBeDefined();
    expect(useDatabaseStatusStore.getState().paused).toBeNull();
  });

  // A 2xx from a route that never touches the workspace database proves nothing about it.
  it('clears the pause on a workspace-scoped success only', () => {
    useDatabaseStatusStore.getState().setPaused('DB_UNREACHABLE', null);
    clearDatabasePauseOnSuccess('/api/health/version');
    clearDatabasePauseOnSuccess('/api/organizations/onboarding');
    clearDatabasePauseOnSuccess('/api/admin/platform/database/degraded');
    expect(useDatabaseStatusStore.getState().paused).toBe('DB_UNREACHABLE');

    clearDatabasePauseOnSuccess('/api/messages/threads');
    expect(useDatabaseStatusStore.getState().paused).toBeNull();
  });
});

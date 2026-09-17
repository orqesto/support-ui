/**
 * A refused save must show the server's reason. 2026-09-17: the backend now refuses to enable a
 * Confluence source that cannot authenticate and says why ("auth failed 401 — check the email and
 * API token"). The hook used to replace every failure with "Failed to save <name>", which would
 * have hidden exactly that.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock('@/services/integrations.service', () => ({ integrationsService: { upsert } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { useIntegrationCard } from '../useIntegrationCard';

describe('useIntegrationCard — a refused save', () => {
  it("shows the backend's reason, not a generic line", async () => {
    // The api-client interceptor copies the body onto the error it throws (see lib/apiError).
    upsert.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        status: 400,
        data: {
          error: 'Could not connect to Confluence: Confluence auth failed (tenant 401, gateway 401). Check the email + API token',
        },
      })
    );
    const onShowAlert = vi.fn();
    const { result } = renderHook(() =>
      useIntegrationCard({
        integrationType: 'confluence',
        integrationDisplayName: 'Confluence',
        initialConfig: { baseUrl: 'https://acme.atlassian.net', email: 'a@acme.com', apiToken: 'ATATT-par' },
        onRefresh: vi.fn().mockResolvedValue(undefined),
        onShowAlert,
      })
    );
    await act(async () => {
      await result.current.saveIntegration('Confluence-ODL');
    });
    const alert = onShowAlert.mock.calls.at(-1)?.[0] as { variant: string; description: string };
    expect(alert.variant).toBe('error');
    expect(alert.description).toContain('auth failed (tenant 401, gateway 401)');
  });
});

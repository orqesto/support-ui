/**
 * The thread header and the AI flags (2026-10-21): "Mark as lead" only where lead qualification can
 * run. Shared header mocks: md4.header.utils.tsx (imported first so its mocks register).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { svc, message, renderHeader } from './md4.header.utils';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

const api = vi.hoisted(() => ({
  leadConfig: {} as Record<string, unknown>,
  leadReads: 0,
}));
// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    {
      get:
        () =>
        (url: string): Promise<unknown> => {
          if (url === '/api/organizations/lead-config') {
            api.leadReads += 1;
            return Promise.resolve({ data: { success: true, data: api.leadConfig } });
          }
          return Promise.resolve({ data: { success: true, data: [] } });
        },
    }
  ),
}));

beforeEach(() => {
  api.leadReads = 0;
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

const menuLabels = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
  return within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((item) => item.textContent?.trim() ?? '');
};

describe('More menu — Mark as lead', () => {
  it('not offered when lead qualification is not configured', async () => {
    api.leadConfig = { departments: [], configured: false };
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    await waitFor(() => expect(api.leadReads).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const labels = await menuLabels();
    expect(labels).not.toContain('Mark as lead');
    expect(labels).toContain('Thread history');
  });

  it.each([
    ['configured: true', { departments: [3], configured: true }],
    ['field absent (older backend)', { departments: [3] }],
  ])('CONTROL — %s: offered', async (_label, config) => {
    api.leadConfig = config;
    renderHeader({ message });
    await waitFor(() => expect(api.leadReads).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await menuLabels()).toContain('Mark as lead');
  });
});

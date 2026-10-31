/** F1: "Run now" lives in Settings › AI › Automatic actions, for a workspace admin only. */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const perms = vi.hoisted(() => ({ canManageOrg: true }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/kb/KbQualityCoverage', () => ({ KbQualityCoverage: () => null }));
vi.mock('../KbRunNow', () => ({ KbRunNow: () => <div data-testid="kb-run-now" /> }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => perm !== 'manage_organization' || perms.canManageOrg,
  }),
}));

import { KbAutoActionsPanel } from '../KbAutoActionsPanel';

const gate = { allowed: true, needRated: 0, rate: 0.95, reason: null };
const actionRow = {
  mode: 'shadow',
  threshold: null,
  agreement: { decided: 0, agreed: 0, rate: null, atThreshold: null },
  gate,
  wouldAct: 0,
  actedLast90d: 0,
  blockedBy: [],
};
const overview = {
  settings: { remove: { mode: 'shadow', threshold: 0.9 } },
  actions: { remove: { ...actionRow, threshold: 0.9 }, hold: actionRow },
  transientSkips: 0,
};

beforeEach(() => {
  perms.canManageOrg = true;
  api.get.mockImplementation(() => Promise.resolve({ data: { success: true, data: overview } }));
});
afterEach(cleanup);

describe('Run now in Automatic actions', () => {
  it('Run now renders in Automatic actions for an admin, not for an agent', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <KbAutoActionsPanel />
      </MemoryRouter>
    );
    expect(await screen.findByTestId('kb-run-now')).toBeInTheDocument();
    unmount();
    perms.canManageOrg = false;
    render(
      <MemoryRouter>
        <KbAutoActionsPanel />
      </MemoryRouter>
    );
    await screen.findByLabelText('Automatic actions');
    expect(screen.queryByTestId('kb-run-now')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { KB_MINING_DEFERRED_LINE } from '../kbRangeCopy';

const connectWithPopup = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/gmail-oauth.service', () => ({
  gmailOAuthService: {
    connectWithPopup: (...args: unknown[]) => connectWithPopup(...args),
    hasPendingRedirectResult: () => false,
    consumePendingRedirectResult: () => Promise.resolve(null),
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { countGmailMessages: () => Promise.resolve({ count: 1 }), update: vi.fn() },
}));
vi.mock('@/hooks/useCreateSourceDepartments', () => ({
  useCreateSourceDepartments: () => ({
    departments: [{ id: 1, name: 'Support' }],
    loading: false,
    selectedIds: [1],
    setSelectedIds: vi.fn(),
    defaultDepartmentId: 1,
    setDefaultDepartmentId: vi.fn(),
    assignToNewSource: () => Promise.resolve(true),
  }),
}));

import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const connect = async (reply: Record<string, unknown>) => {
  connectWithPopup.mockResolvedValue({
    success: true,
    data: { id: 68, email: 'orders@x.io' },
    ...reply,
  });
  const onShowAlert = vi.fn();
  render(<GmailIntegrationCard integrations={[]} onRefresh={vi.fn()} onShowAlert={onShowAlert} />);
  fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
  fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
  await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
  return onShowAlert.mock.calls[0][0] as { description: string; variant: string };
};

describe('Gmail connect with the plan inactive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the deferral sentence as a warning', async () => {
    const alert = await connect({ kbMiningDeferred: 'plan_inactive' });
    expect(alert.description).toContain(KB_MINING_DEFERRED_LINE);
    expect(alert.variant).toBe('warning');
  });

  it('shows nothing extra when it is absent', async () => {
    const alert = await connect({});
    expect(alert.description).not.toContain(KB_MINING_DEFERRED_LINE);
    expect(alert.variant).toBe('success');
  });
});

/**
 * FE audit 2026-09-29, B-H3: "Add Gmail" on an already-connected mailbox reset its settings and
 * relinked it to every department, and there was no other way to reconnect. Now: a mailbox that
 * Google signs in to and that is ALREADY a source is not relinked, and "Reconnect Google
 * Account" sends no settings at all (the backend keeps a stored value when none is sent).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const connectWithPopup = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const assignToNewSource = vi.fn(() => Promise.resolve(true));
vi.mock('@/services/gmail-oauth.service', () => ({
  gmailOAuthService: {
    connectWithPopup: (...args: unknown[]) => connectWithPopup(...args),
    hasPendingRedirectResult: () => false,
    consumePendingRedirectResult: () => Promise.resolve(null),
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: () => Promise.resolve({ count: 0, capped: false, query: '' }),
    update: vi.fn(),
  },
}));
vi.mock('@/hooks/useCreateSourceDepartments', () => ({
  useCreateSourceDepartments: () => ({
    departments: [{ id: 1, name: 'Support' }],
    loading: false,
    selectedIds: [1],
    setSelectedIds: vi.fn(),
    defaultDepartmentId: 1,
    setDefaultDepartmentId: vi.fn(),
    assignToNewSource,
  }),
}));

import { GmailIntegrationCard } from '@/components/settings/integrations/GmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const existing = {
  id: 68,
  name: 'Gmail-orders@deuspower.info',
  type: 'gmail' as const,
  enabled: true,
  isKnowledgeBase: true,
  config: {
    user: 'orders@deuspower.info',
    gmail: { searchQuery: 'label:orders', bulkImportDays: 7 },
  },
};

afterEach(cleanup);

describe('reconnecting a Gmail source keeps what it had', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Reconnect Google Account sends NO settings and relinks nothing', async () => {
    connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 68, email: 'orders@deuspower.info' },
    });
    const onShowAlert = vi.fn();
    render(
      <GmailIntegrationCard
        integrations={[existing] as never}
        onRefresh={vi.fn()}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions for this mailbox' }));
    fireEvent.click(screen.getByRole('button', { name: /Reconnect Google Account/ }));
    await waitFor(() => expect(connectWithPopup).toHaveBeenCalledTimes(1));
    // Nothing the Add form holds travels: the backend keeps the stored search query, history
    // range, KB flag and page size.
    expect(connectWithPopup.mock.calls[0][0]).toEqual({});
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(assignToNewSource).not.toHaveBeenCalled();
    const alert = onShowAlert.mock.calls.at(-1)?.[0] as { variant: string; description: string };
    expect(alert.variant).toBe('success');
    expect(alert.description).toContain('settings and departments were kept');
  });

  it('Reconnect that Google answers with a DIFFERENT mailbox says so', async () => {
    connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 99, email: 'other@deuspower.info' },
    });
    const onShowAlert = vi.fn();
    render(
      <GmailIntegrationCard
        integrations={[existing] as never}
        onRefresh={vi.fn()}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions for this mailbox' }));
    fireEvent.click(screen.getByRole('button', { name: /Reconnect Google Account/ }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls.at(-1)?.[0] as { variant: string; description: string };
    expect(alert.variant).toBe('warning');
    expect(alert.description).toContain('other@deuspower.info');
  });

  it('Add Gmail that lands on an EXISTING mailbox does not relink its departments', async () => {
    connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 68, email: 'orders@deuspower.info' },
    });
    const onShowAlert = vi.fn();
    render(
      <GmailIntegrationCard
        integrations={[existing] as never}
        onRefresh={vi.fn()}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(assignToNewSource).not.toHaveBeenCalled();
    const alert = onShowAlert.mock.calls.at(-1)?.[0] as { description: string };
    expect(alert.description).toContain('already a source here');
  });

  it('CONTROL: Add Gmail that creates a NEW mailbox links it to the chosen departments', async () => {
    connectWithPopup.mockResolvedValue({
      success: true,
      data: { id: 99, email: 'new@deuspower.info' },
    });
    render(
      <GmailIntegrationCard
        integrations={[existing] as never}
        onRefresh={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Gmail/ }));
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/ }));
    await waitFor(() => expect(assignToNewSource).toHaveBeenCalledWith(99));
  });
});

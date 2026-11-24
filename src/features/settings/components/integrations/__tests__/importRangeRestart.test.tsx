/**
 * Moving a mailbox's import start EARLIER restarts its import, and the save says so
 * (`importRestarted: true`). While a poll runs the server refuses with 409
 * IMPORT_RANGE_SYNC_RUNNING and saves nothing. Before this, a refused save read "Update
 * Failed", and the IMAP dialog promised a sync "on next polling cycle" that never happened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const update = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    update: (...args: unknown[]) => update(...args),
    getIntegrations: () => Promise.resolve({ success: true, data: [] }),
  },
}));
vi.mock('@/features/settings/hooks/useCreateSourceDepartments', () => ({
  useCreateSourceDepartments: () => ({
    departments: [],
    loading: false,
    selectedIds: [],
    setSelectedIds: () => undefined,
    defaultDepartmentId: undefined,
    setDefaultDepartmentId: () => undefined,
    assignToNewSource: () => Promise.resolve(true),
  }),
}));

const { GmailSyncRangeDialog } = await import('../GmailSyncRangeDialog');
const { EmailIntegrationCard } = await import('../EmailIntegrationCard');

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const RUNNING = 'This mailbox is being synced right now — try again in a minute.';
/** The error the api-client interceptor builds for a 4xx: message, status and the untouched body. */
const conflict = () =>
  Object.assign(new Error(RUNNING), {
    status: 409,
    data: { success: false, error: RUNNING, code: 'IMPORT_RANGE_SYNC_RUNNING' },
  });

const onShowAlert = vi.fn<(alert: { title: string; description: string }) => void>();
const onClose = vi.fn<() => void>();
beforeEach(() => {
  update.mockReset();
  onShowAlert.mockReset();
  onClose.mockReset();
});
afterEach(cleanup);

const lastAlert = () => onShowAlert.mock.calls.at(-1)?.[0] ?? { title: '', description: '' };

const openGmail = () =>
  render(
    <GmailSyncRangeDialog
      source={{ id: 5, name: 'Support', currentDays: 30 }}
      onClose={onClose}
      onRefresh={() => Promise.resolve()}
      onShowAlert={onShowAlert}
    />
  );
const pressGmailUpdate = () => fireEvent.click(screen.getByRole('button', { name: /update/i }));

describe('Gmail range — restart and a running poll', () => {
  it('⛔ a restarted import says older mail is being imported', async () => {
    update.mockResolvedValue({ success: true, importRestarted: true });
    openGmail();
    pressGmailUpdate();
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(lastAlert().description).toMatch(/older mail from last 30 days is being imported now/i);
  });

  it('CONTROL: an older backend (no flag) promises no import', async () => {
    update.mockResolvedValue({ success: true });
    openGmail();
    pressGmailUpdate();
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(lastAlert().description).not.toMatch(/being imported/i);
    expect(lastAlert().description).toMatch(/first sync/i);
  });

  it('⛔ a running poll shows the server sentence and keeps the dialog for a retry', async () => {
    update.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ success: true, importRestarted: true });
    openGmail();
    pressGmailUpdate();
    expect(await screen.findByText(`Not saved: ${RUNNING}`)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onShowAlert).not.toHaveBeenCalled();

    pressGmailUpdate();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(update.mock.calls[1]).toEqual(update.mock.calls[0]);
  });

  it('CONTROL: any other failure keeps its "Update Failed" alert', async () => {
    update.mockRejectedValue(Object.assign(new Error('Bad range'), { status: 400, data: { error: 'Bad range' } }));
    openGmail();
    pressGmailUpdate();
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(lastAlert().title).toBe('Update Failed');
    expect(screen.queryByText(/Not saved/)).not.toBeInTheDocument();
  });
});

const imapRow = {
  id: 7,
  name: 'help@shop.example',
  type: 'email' as const,
  enabled: true,
  isKnowledgeBase: false,
  config: { user: 'help@shop.example', email: { host: 'imap.shop.example', bulkImportDays: 30 } },
};
const openImap = () => {
  render(<EmailIntegrationCard integrations={[imapRow] as never} onRefresh={() => Promise.resolve()} onShowAlert={onShowAlert} />);
  fireEvent.click(screen.getByRole('button', { name: 'Bulk import historical emails' }));
};
const pressStartImport = () => fireEvent.click(screen.getByRole('button', { name: 'Start Import' }));

describe('IMAP range — restart and a running poll', () => {
  it('⛔ no promise of a sync "on next polling cycle" when nothing was restarted', async () => {
    update.mockResolvedValue({ success: true });
    openImap();
    expect(screen.queryByText(/on first connect/i)).not.toBeInTheDocument();
    pressStartImport();
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(lastAlert().description).not.toMatch(/next polling cycle|being imported/i);
  });

  it('CONTROL: a restarted import says older mail is being imported', async () => {
    update.mockResolvedValue({ success: true, importRestarted: true });
    openImap();
    pressStartImport();
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect(lastAlert().description).toMatch(/is being imported now/i);
  });

  it('⛔ a running poll shows the server sentence and keeps the dialog', async () => {
    update.mockRejectedValue(conflict());
    openImap();
    pressStartImport();
    expect(await screen.findByText(`Not saved: ${RUNNING}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Import' })).toBeInTheDocument();
    expect(onShowAlert).not.toHaveBeenCalled();
  });
});

/**
 * FE-3a wiring: a KB mailbox's history range lives in the KB dialog (kebab / calendar / strip
 * button); a non-KB mailbox keeps its Initial Sync Range. "Bulk: 30d" when the config has no days.
 * The Re-mine 409 reads the server's `message`; the KB-on deferral is said in words.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useKbRangeDialogStore } from '@/stores/kbRangeDialogStore';

vi.mock('@/services/gmail-oauth.service', () => ({
  gmailOAuthService: {
    hasPendingRedirectResult: () => false,
    consumePendingRedirectResult: () => Promise.resolve(null),
  },
}));
let upsert: () => Promise<unknown> = () => Promise.resolve({ success: true });
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    countGmailMessages: () => Promise.resolve({ count: 0, capped: false, query: '' }),
    update: () => Promise.resolve({ success: true }),
    upsert: () => upsert(),
    getIntegrations: () => Promise.resolve({ success: true, data: [] }),
  },
}));
vi.mock('@/hooks/useCreateSourceDepartments', () => ({
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
let reprocess: () => Promise<unknown> = () => Promise.resolve({});
vi.mock('@/services/kb.service', () => ({
  kbService: {
    getMiningForecast: () => Promise.reject(new Error('no forecast')),
    reprocessSource: () => reprocess(),
  },
}));
vi.mock('../KbHistoryRangeDialog', () => ({
  KbHistoryRangeDialog: ({ source }: { source: { id: number; name: string; type: string } }) => (
    <div data-testid="kb-range-dialog">{`${source.type}:${source.id}:${source.name}`}</div>
  ),
}));

const { GmailIntegrationCard } = await import('../GmailIntegrationCard');
const { EmailIntegrationCard } = await import('../EmailIntegrationCard');
const { SourceKbStrip } = await import('../SourceKbStrip');

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const gmail = (over: Record<string, unknown> = {}, gmailConfig: Record<string, unknown> = {}) => ({
  id: 68,
  name: 'Gmail-a@b.c',
  type: 'gmail' as const,
  enabled: true,
  isKnowledgeBase: true,
  kbMarkedAt: '2026-09-01T00:00:00Z',
  config: { user: 'a@b.c', gmail: { searchQuery: '', bulkImportDays: 7, ...gmailConfig } },
  ...over,
});
const imap = (over: Record<string, unknown> = {}) => ({
  id: 12,
  name: 'Email-x@y.z',
  type: 'email' as const,
  enabled: true,
  isKnowledgeBase: true,
  kbMarkedAt: '2026-09-01T00:00:00Z',
  config: {
    email: { host: 'mail.y.z', port: 993, user: 'x@y.z', password: 'abcd••••wxyz', secure: true },
  },
  ...over,
});

beforeEach(() => {
  useKbRangeDialogStore.getState().close();
  upsert = () => Promise.resolve({ success: true });
  reprocess = () => Promise.resolve({});
});
afterEach(cleanup);

const gmailCard = (integration: unknown) =>
  render(
    <GmailIntegrationCard
      integrations={[integration] as never}
      onRefresh={vi.fn()}
      onShowAlert={vi.fn()}
    />
  );
const openKebab = () =>
  fireEvent.click(screen.getByRole('button', { name: 'More actions for this mailbox' }));

describe('history range wiring', () => {
  it('Gmail kebab on a KB source opens the KB range dialog; non-KB opens Change Initial Sync Range', () => {
    gmailCard(gmail());
    openKebab();
    // The kebab's item (the strip beside the row has a button of the same name).
    const item = screen
      .getAllByRole('button', { name: /History range/ })
      .find((button) => button.closest('.absolute'));
    fireEvent.click(item as HTMLElement);
    expect(screen.getByTestId('kb-range-dialog').textContent).toBe('gmail:68:Gmail-a@b.c');
    expect(screen.queryByText('Change Initial Sync Range')).toBeNull();
    cleanup();
    useKbRangeDialogStore.getState().close();

    gmailCard(gmail({ isKnowledgeBase: false }));
    openKebab();
    fireEvent.click(screen.getByRole('button', { name: /Initial Sync Range/ }));
    expect(screen.getByText('Change Initial Sync Range')).toBeInTheDocument();
    expect(screen.queryByTestId('kb-range-dialog')).toBeNull();
  });

  it('IMAP Calendar on a KB source opens the KB dialog; non-KB keeps Initial Sync Range', () => {
    render(
      <EmailIntegrationCard
        integrations={[imap()] as never}
        onRefresh={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('History range'));
    expect(screen.getByTestId('kb-range-dialog').textContent).toBe('email:12:Email-x@y.z');
    expect(screen.queryByText('Initial Sync Range')).toBeNull();
    cleanup();
    useKbRangeDialogStore.getState().close();

    render(
      <EmailIntegrationCard
        integrations={[imap({ isKnowledgeBase: false })] as never}
        onRefresh={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Bulk import historical emails'));
    expect(screen.getByText('Initial Sync Range')).toBeInTheDocument();
    expect(screen.queryByTestId('kb-range-dialog')).toBeNull();
  });

  it('History range button only for gmail/email KB sources', () => {
    const strip = (source: Record<string, unknown>) =>
      render(<SourceKbStrip source={source as never} onShowAlert={vi.fn()} />);
    strip({ id: 1, name: 'g', type: 'gmail', isKnowledgeBase: true, kbMarkedAt: null });
    fireEvent.click(screen.getByRole('button', { name: 'History range' }));
    expect(screen.getByTestId('kb-range-dialog').textContent).toBe('gmail:1:g');
    cleanup();
    useKbRangeDialogStore.getState().close();

    strip({ id: 2, name: 'c', type: 'confluence', isKnowledgeBase: true, kbMarkedAt: null });
    expect(screen.queryByRole('button', { name: 'History range' })).toBeNull();
    expect(screen.getByRole('button', { name: /re-mine/i })).toBeInTheDocument();
    cleanup();

    // Not a KB source: no strip at all.
    strip({ id: 3, name: 'n', type: 'gmail', isKnowledgeBase: false });
    expect(screen.queryByRole('button', { name: 'History range' })).toBeNull();
  });

  it('"Bulk: 30d" when bulkImportDays is absent; 0 is still All time', () => {
    gmailCard(gmail({ config: { user: 'a@b.c', gmail: { searchQuery: '' } } }));
    expect(screen.getByText(/Bulk: 30d/)).toBeInTheDocument();
    cleanup();
    gmailCard(gmail({}, { bulkImportDays: 0 }));
    expect(screen.getByText(/Bulk: All time/)).toBeInTheDocument();
  });
});

describe('Re-mine refusals and the KB-on deferral', () => {
  it('Re-mine 409 PLAN_INACTIVE shows the server message', async () => {
    reprocess = () =>
      Promise.reject(
        Object.assign(new Error('Request failed'), {
          status: 409,
          data: {
            success: false,
            code: 'PLAN_INACTIVE',
            message:
              'This workspace has no active plan, so nothing would be mined. Choose a plan first.',
          },
        })
      );
    const onShowAlert = vi.fn();
    render(
      <SourceKbStrip
        source={{
          id: 9,
          name: 'g',
          type: 'gmail',
          isKnowledgeBase: true,
          kbMarkedAt: '2026-09-01T00:00:00Z',
        }}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /re-mine/i }));
    const confirm = screen
      .getAllByRole('button')
      .find(
        (btn) =>
          /re-mine/i.test(btn.textContent ?? '') &&
          btn.closest('[role="dialog"], [role="alertdialog"]')
      );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls.at(-1)?.[0] as { description: string; variant: string };
    expect(alert.variant).toBe('error');
    expect(alert.description).toBe(
      'This workspace has no active plan, so nothing would be mined. Choose a plan first.'
    );
  });

  it('Re-mine 409 AI_UNAVAILABLE prints words, never the raw reason code', async () => {
    reprocess = () =>
      Promise.reject(
        Object.assign(new Error('x'), {
          status: 409,
          data: {
            code: 'AI_UNAVAILABLE',
            message:
              'AI is unavailable for this workspace right now (rate_limited), so a re-mine would mine nothing. Try again later.',
          },
        })
      );
    const onShowAlert = vi.fn();
    render(
      <SourceKbStrip
        source={{
          id: 9,
          name: 'g',
          type: 'gmail',
          isKnowledgeBase: true,
          kbMarkedAt: '2026-09-01T00:00:00Z',
        }}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /re-mine/i }));
    const confirm = screen
      .getAllByRole('button')
      .find(
        (btn) =>
          /re-mine/i.test(btn.textContent ?? '') &&
          btn.closest('[role="dialog"], [role="alertdialog"]')
      );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const text = (onShowAlert.mock.calls.at(-1)?.[0] as { description: string }).description;
    expect(text).not.toContain('rate_limited');
    expect(text).toContain('hourly AI allowance');
  });

  it('KB-on deferral sentence after saving an IMAP mailbox with kbMiningDeferred', async () => {
    upsert = () =>
      Promise.resolve({ success: true, action: 'updated', kbMiningDeferred: 'plan_inactive' });
    const onShowAlert = vi.fn();
    render(
      <EmailIntegrationCard
        integrations={[imap()] as never}
        onRefresh={vi.fn()}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByLabelText('Edit this mailbox'));
    fireEvent.click(screen.getByRole('button', { name: /^(Update|Save)/ }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls.at(-1)?.[0] as { description: string };
    expect(alert.description).toContain(
      'Knowledge base is on, but nothing is mined yet: this workspace has no active plan. Once a plan is chosen, press Re-mine on this mailbox.'
    );
  });

  it('the deferral alert is a warning, never success/info (nothing is mined yet)', async () => {
    upsert = () =>
      Promise.resolve({ success: true, action: 'created', kbMiningDeferred: 'plan_inactive' });
    const onShowAlert = vi.fn();
    render(
      <EmailIntegrationCard
        integrations={[imap()] as never}
        onRefresh={vi.fn()}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByLabelText('Edit this mailbox'));
    fireEvent.click(screen.getByRole('button', { name: /^(Update|Save)/ }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    expect((onShowAlert.mock.calls.at(-1)?.[0] as { variant: string }).variant).toBe('warning');
  });

  it('CONTROL: no deferral field, no deferral sentence', async () => {
    const onShowAlert = vi.fn();
    render(
      <EmailIntegrationCard
        integrations={[imap()] as never}
        onRefresh={vi.fn()}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByLabelText('Edit this mailbox'));
    fireEvent.click(screen.getByRole('button', { name: /^(Update|Save)/ }));
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    const alert = onShowAlert.mock.calls.at(-1)?.[0] as { description: string };
    expect(alert.description).not.toContain('nothing is mined yet');
  });
});

describe('Re-mine 409 with another code', () => {
  const refuse = async (error: unknown) => {
    reprocess = () => Promise.reject(error as Error);
    const onShowAlert = vi.fn();
    render(
      <SourceKbStrip
        source={{
          id: 9,
          name: 'g',
          type: 'gmail',
          isKnowledgeBase: true,
          kbMarkedAt: '2026-09-01T00:00:00Z',
        }}
        onShowAlert={onShowAlert}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /re-mine/i }));
    const confirm = screen
      .getAllByRole('button')
      .find(
        (btn) =>
          /re-mine/i.test(btn.textContent ?? '') &&
          btn.closest('[role="dialog"], [role="alertdialog"]')
      );
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() => expect(onShowAlert).toHaveBeenCalled());
    return (onShowAlert.mock.calls.at(-1)?.[0] as { description: string }).description;
  };

  it('shows the server sentence, never the raw code', async () => {
    const text = await refuse(
      Object.assign(new Error('Request failed with status code 409'), {
        status: 409,
        data: { code: 'SOME_NEW_CODE', message: 'Too many re-mines are running. Try again later.' },
      })
    );
    expect(text).toBe('Too many re-mines are running. Try again later.');
    expect(text).not.toContain('SOME_NEW_CODE');
  });

  it('a 409 whose body has no sentence shows the request failure, not the code', async () => {
    const text = await refuse(
      Object.assign(new Error('Request failed with status code 409'), {
        status: 409,
        data: { code: 'SOME_NEW_CODE' },
      })
    );
    expect(text).not.toContain('SOME_NEW_CODE');
    expect(text.length).toBeGreaterThan(0);
  });
});

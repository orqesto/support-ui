import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render as rtlRender, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const testImapConfig = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    testImapConfig: (...args: unknown[]) => testImapConfig(...args),
    getIntegrations: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

const integration = {
  id: 12,
  name: 'Email-support@example.com',
  type: 'email' as const,
  enabled: true,
  isKnowledgeBase: false,
  config: {
    email: {
      host: 'imap.tested.example.com',
      port: 993,
      user: 'support@example.com',
      password: 'x',
      secure: true,
    },
  },
};

const FOUND = {
  success: true,
  data: { success: true, message: 'Connected', details: { messageCount: 42 } },
};

const startCheck = async () => {
  let settle: { resolve: (value: unknown) => void; reject: (reason: unknown) => void } = {
    resolve: () => {},
    reject: () => {},
  };
  testImapConfig.mockImplementationOnce(
    () => new Promise((resolve, reject) => (settle = { resolve, reject }))
  );
  const onShowAlert = vi.fn();
  render(
    <EmailIntegrationCard
      integrations={[integration] as never}
      onRefresh={vi.fn()}
      onShowAlert={onShowAlert}
    />
  );
  fireEvent.click(screen.getByLabelText('Edit this mailbox'));
  fireEvent.click(await screen.findByRole('button', { name: /check messages count/i }));
  const land = (value: unknown) =>
    act(async () => {
      settle.resolve(value);
      await Promise.resolve();
    });
  const fail = (reason: unknown) =>
    act(async () => {
      settle.reject(reason);
      await Promise.resolve();
    });
  return { land, fail, onShowAlert };
};

/** "Found N messages matching your criteria" is about the criteria the check ran with. */
describe('IMAP check — an answer that lands after the form changed', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('⛔ neither claims the count nor pops "Connection Successful" for the new settings', async () => {
    const { land, onShowAlert } = await startCheck();
    fireEvent.change(screen.getByDisplayValue('imap.tested.example.com'), {
      target: { value: 'imap.other.example.com' },
    });
    await land(FOUND);

    expect(testImapConfig.mock.calls[0][0]).toMatchObject({ host: 'imap.tested.example.com' });
    expect(screen.queryByText(/Found 42 messages/)).not.toBeInTheDocument();
    expect(onShowAlert).not.toHaveBeenCalled();
  });

  it('⛔ nor a failure', async () => {
    const { fail, onShowAlert } = await startCheck();
    fireEvent.change(screen.getByDisplayValue('imap.tested.example.com'), {
      target: { value: 'imap.other.example.com' },
    });
    await fail(new Error('AUTHENTICATE failed'));
    expect(onShowAlert).not.toHaveBeenCalled();
  });

  it('CONTROL: an un-overtaken failure does alert', async () => {
    const { fail, onShowAlert } = await startCheck();
    await fail(new Error('AUTHENTICATE failed'));
    expect(onShowAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Connection Failed', description: 'AUTHENTICATE failed' })
    );
  });

  it('CONTROL: a check nobody overtook shows the count and the alert', async () => {
    const { land, onShowAlert } = await startCheck();
    await land(FOUND);
    expect(screen.getByText(/Found 42 messages/)).toBeInTheDocument();
    expect(onShowAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Connection Successful' })
    );
  });
});

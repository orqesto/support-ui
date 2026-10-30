import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const upsert = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    upsert: (...args: unknown[]) => upsert(...args),
    getIntegrations: vi.fn().mockResolvedValue({ success: true, data: [] }),
  },
}));

import { EmailIntegrationCard } from '@/components/settings/integrations/EmailIntegrationCard';

const render = (ui: ReactElement) => rtlRender(<ThemeProvider>{ui}</ThemeProvider>);

/**
 * WIRING: the IMAP form saves "mark imported messages read and label them" (support-service#1229)
 * with the rest of the mailbox config. The setting rides on `config.email` through the edit form's
 * spread; a refactor that rebuilt the saved object field by field would drop it silently.
 */
const integration = (markImported?: { enabled: boolean; label?: string }) => ({
  id: 12,
  name: 'Email-support@example.com',
  type: 'email' as const,
  enabled: true,
  isKnowledgeBase: false,
  config: {
    email: {
      host: 'imap.example.com',
      port: 993,
      user: 'support@example.com',
      password: 'abcd••••••••wxyz',
      secure: true,
      ...(markImported ? { markImported } : {}),
    },
  },
});

const openAndSave = async (source: ReturnType<typeof integration>, toggle = false) => {
  render(
    <EmailIntegrationCard
      integrations={[source] as never}
      onRefresh={vi.fn(() => Promise.resolve())}
      onShowAlert={vi.fn()}
    />
  );
  fireEvent.click(screen.getByLabelText('Edit this mailbox'));
  if (toggle) {
    fireEvent.click(
      await screen.findByRole('switch', { name: /mark imported messages as read and label them/i })
    );
  }
  fireEvent.click(await screen.findByRole('button', { name: /update email/i }));
  await waitFor(() => expect(upsert).toHaveBeenCalled());
  return (upsert.mock.calls[0][0] as { config: { email: Record<string, unknown> } }).config.email;
};

describe('IMAP form saves the mark-imported setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue({ success: true, action: 'updated' });
  });

  it('turning it on in the form saves it', async () => {
    const saved = await openAndSave(integration(), true);
    expect(saved.markImported).toEqual({ enabled: true });
  });

  it('an edit of something else keeps the stored setting and label', async () => {
    const saved = await openAndSave(integration({ enabled: true, label: 'Done' }));
    expect(saved.markImported).toEqual({ enabled: true, label: 'Done' });
  });
});

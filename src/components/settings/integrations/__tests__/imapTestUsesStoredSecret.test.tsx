import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
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

/**
 * WIRING, not logic. `GET /api/integrations` masks the password as `first4••••••••last4` and
 * the edit form is seeded straight from it, so "Check messages count" posts the MASK. The
 * backend can only substitute the stored secret if it is told WHICH source — and if this id
 * stops reaching it (a rename on either side, a refactor that drops the spread) the bug comes
 * back silently: a working mailbox reported as `AUTHENTICATE failed` while "Test connection",
 * which probes the stored config, stays green. 2026-09-11.
 */
const MASKED = 'tjdf••••••••dGTc';

const integration = {
  id: 12,
  name: 'Email-natalie.antonenko@prefabhome.eu',
  type: 'email' as const,
  enabled: true,
  isKnowledgeBase: false,
  config: {
    email: {
      host: 'mail.frame-house.eu',
      port: 993,
      user: 'natalie.antonenko@prefabhome.eu',
      password: MASKED,
      secure: true,
    },
  },
};

describe('IMAP "Check messages count" on an existing source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testImapConfig.mockResolvedValue({ success: true, data: { success: true, message: 'ok' } });
  });

  it('tells the backend which source the masked password belongs to', async () => {
    render(
      <EmailIntegrationCard
        integrations={[integration] as never}
        onRefresh={vi.fn()}
        onShowAlert={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Edit this mailbox'));
    fireEvent.click(await screen.findByRole('button', { name: /check messages count/i }));

    await waitFor(() => expect(testImapConfig).toHaveBeenCalled());
    expect(testImapConfig.mock.calls[0][0]).toMatchObject({
      integrationId: 12,
      password: MASKED,
    });
  });
});

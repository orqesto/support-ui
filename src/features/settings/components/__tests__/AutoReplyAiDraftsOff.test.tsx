import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * With AI drafts off the auto-reply settings are KEPT (they apply again when drafts come back),
 * so the page must say that nothing here sends meanwhile — and must not claim the prepared
 * receipt confirmation stops too: it is not AI-written and still goes out.
 */

const aiDrafts = { off: true };
vi.mock('@/features/settings/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAutoReply: () =>
      Promise.resolve({
        enabled: true,
        requestMissingInfo: true,
        suggestSolutions: true,
        highConfidenceThreshold: 0.85,
      }),
    getCurrent: () => Promise.resolve({ settings: {} }),
  },
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isOrgAdmin: true, hasPermission: () => true }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { AutoReplyConfiguration } from '../AutoReplyConfiguration';

beforeEach(() => {
  aiDrafts.off = true;
});

describe('AutoReplyConfiguration — AI drafts off', () => {
  it('says the AI sends no reply of its own, and that the receipt confirmation still goes out', async () => {
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    expect(await screen.findByText(/the AI sends no reply of its own/i)).toBeInTheDocument();
    expect(
      screen.getByText(/receipt confirmation \("we got your message"\) is not AI-written/i)
    ).toBeInTheDocument();
  });

  it('says nothing of the kind with drafts on (control)', async () => {
    aiDrafts.off = false;
    render(<AutoReplyConfiguration onShowAlert={() => {}} />);
    expect(await screen.findAllByText('Automatic email replies')).not.toHaveLength(0);
    expect(screen.queryByText(/the AI sends no reply of its own/i)).not.toBeInTheDocument();
  });
});

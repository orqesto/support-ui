import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * With AI drafts off the backend answers the suggested-answer call with search results and
 * `reason: 'ai-drafts-off'` — and no `aiConfigured`, since a provider is not the question. The
 * dialog must say drafts are off and still show the matches; "connect a provider" would send an
 * admin to fix something that is not broken.
 */

const getSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getSuggestedAnswer: (...args: unknown[]) => getSuggestedAnswer(...args) },
}));
vi.mock('@/hooks/useTranslation', () => ({
  useSupportedLanguages: () => ({ languages: [], fetchLanguages: () => Promise.resolve() }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { SimilarMessagesDialog } from '../SimilarMessagesDialog';

const MATCH = 'You can reset your password from the login page.';

const respond = (extra: Record<string, unknown>) =>
  getSuggestedAnswer.mockResolvedValue({
    success: true,
    data: {
      mode: 'search-results',
      sources: [
        {
          type: 'knowledge_base',
          id: 7,
          title: 'Password reset',
          content: 'How do I reset my password?',
          answer: MATCH,
          similarity: 0.9,
        },
      ],
      searchPerformed: { documentation: true, tickets: true, messages: true },
      ...extra,
    },
  });

const renderDialog = () =>
  render(
    <MemoryRouter>
      <SimilarMessagesDialog messageId={3} open onClose={() => {}} onSelectAnswer={() => {}} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SimilarMessagesDialog — AI drafts off', () => {
  it('says drafts are off, not "connect a provider", and still shows the matches', async () => {
    respond({ reason: 'ai-drafts-off' });
    renderDialog();
    expect(
      await screen.findByText(/AI drafts are switched off for this workspace/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/need a provider/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No reply was drafted for this message\./i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/reset your password/i).length).toBeGreaterThan(0);
  });

  it('an empty knowledge base still reads as a content gap (control)', async () => {
    respond({ reason: 'no-sources' });
    renderDialog();
    expect(await screen.findByText(/Nothing in the knowledge base matched/i)).toBeInTheDocument();
    expect(screen.queryByText(/AI drafts are switched off/i)).not.toBeInTheDocument();
  });
});

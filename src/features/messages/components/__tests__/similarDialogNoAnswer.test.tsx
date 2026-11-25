import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The draft card showed "95% Very Confident" on a draft that only said the team would check: the
 * percentage is the similarity of the sources found, not whether they answer. When the backend
 * marks the draft `knowledgeAnswer: 'none'`, the card says so instead of showing a percentage.
 */

const getSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSuggestedAnswer: (...args: unknown[]) => getSuggestedAnswer(...args),
    saveSuggestedAnswer: vi.fn(),
  },
}));
vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('@/hooks/useTranslation', () => ({
  useSupportedLanguages: () => ({
    languages: [{ code: 'en', name: 'English' }],
    fetchLanguages: () => Promise.resolve(),
  }),
}));
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { SimilarMessagesDialog } from '../SimilarMessagesDialog';

const DRAFT = 'We will check whether this can be sent there and confirm with you.';

const answer = (aiResponse: Record<string, unknown>) => ({
  success: true,
  data: {
    mode: 'ai-generated',
    aiResponse: { text: DRAFT, confidence: 0.95, ...aiResponse },
    sources: [],
    searchPerformed: { documentation: true, tickets: true, messages: true },
  },
});

const renderDialog = () =>
  render(
    <MemoryRouter>
      <SimilarMessagesDialog messageId={3} open onClose={vi.fn()} onSelectAnswer={vi.fn()} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SimilarMessagesDialog — a draft the documentation does not answer', () => {
  it('says no answer was found instead of a percentage', async () => {
    getSuggestedAnswer.mockResolvedValue(answer({ knowledgeAnswer: 'none' }));
    renderDialog();
    await screen.findByText(DRAFT);
    expect(screen.getByTestId('draft-no-answer')).toHaveTextContent('No answer found');
    expect(screen.getByTestId('draft-no-answer')).toHaveTextContent(
      'The documentation found does not answer this question'
    );
    expect(screen.queryByText('95%')).toBeNull();
    expect(screen.queryByText('Very Confident')).toBeNull();
  });

  it('CONTROL: without the mark the percentage is shown as before', async () => {
    getSuggestedAnswer.mockResolvedValue(answer({}));
    renderDialog();
    await screen.findByText(DRAFT);
    expect(screen.getByText('95%')).toBeVisible();
    expect(screen.getByText('Very Confident')).toBeVisible();
    expect(screen.queryByTestId('draft-no-answer')).toBeNull();
  });

  it('the draft can still be used', async () => {
    getSuggestedAnswer.mockResolvedValue(answer({ knowledgeAnswer: 'none' }));
    renderDialog();
    await screen.findByText(DRAFT);
    expect(screen.getByRole('button', { name: /^Use AI Response$/ })).not.toBeInactive();
  });
});

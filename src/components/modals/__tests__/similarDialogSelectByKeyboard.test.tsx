/**
 * Mutation batch (message detail v4), chunk 7: a match card is chosen by keyboard as well as by
 * pointer (Enter or Space on the focused card; no test had been through it), and "Use This
 * Answer" stays disabled until something is chosen.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getSuggestedAnswer: (...args: unknown[]) => getSuggestedAnswer(...args) },
}));
vi.mock('@/hooks/useTranslation', () => ({
  useSupportedLanguages: () => ({ languages: [], fetchLanguages: () => Promise.resolve() }),
}));
vi.mock('@/components/ui/ReactSelect', () => ({ ReactSelect: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { SimilarMessagesDialog } from '../SimilarMessagesDialog';

const MATCH = 'You can reset your password from the login page.';
const SECOND = 'Two-factor codes arrive by SMS within a minute.';

beforeEach(() => {
  vi.clearAllMocks();
  getSuggestedAnswer.mockResolvedValue({
    success: true,
    data: {
      mode: 'search-results',
      reason: 'no-sources',
      sources: [
        { type: 'knowledge_base', id: 7, title: 'Password reset', content: 'How do I reset?', answer: MATCH, similarity: 0.9 },
        { type: 'knowledge_base', id: 8, title: '2FA', content: 'Where is my code?', answer: SECOND, similarity: 0.8 },
      ],
      searchPerformed: { documentation: true, tickets: true, messages: true },
    },
  });
});

const renderDialog = (onSelectAnswer = vi.fn()) => {
  render(
    <MemoryRouter>
      <SimilarMessagesDialog messageId={3} open onClose={() => {}} onSelectAnswer={onSelectAnswer} />
    </MemoryRouter>
  );
  return onSelectAnswer;
};
const card = (text: string) =>
  screen.getAllByRole('button').find((node) => node.textContent?.includes(text)) as HTMLElement;
const useAnswer = () => screen.getByRole('button', { name: /Use This Answer|Insert source text/ });

describe('choosing a match', () => {
  it('"Use This Answer" is disabled until a card is chosen; Enter on a card chooses it', async () => {
    const onSelectAnswer = renderDialog();
    await screen.findAllByText(/reset your password/);
    expect(useAnswer()).toBeDisabled();
    fireEvent.keyDown(card(SECOND), { key: 'Enter' });
    expect(useAnswer()).toBeEnabled();
    fireEvent.click(useAnswer());
    expect(onSelectAnswer).toHaveBeenCalledTimes(1);
    expect(String(onSelectAnswer.mock.calls[0][0])).toContain(SECOND);
  });

  it('Space chooses too, and is not left to scroll the page', async () => {
    renderDialog();
    await screen.findAllByText(/reset your password/);
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => {
      card(MATCH).dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(useAnswer()).toBeEnabled();
  });

  it('CONTROL: any other key chooses nothing', async () => {
    renderDialog();
    await screen.findAllByText(/reset your password/);
    fireEvent.keyDown(card(MATCH), { key: 'a' });
    fireEvent.keyDown(card(MATCH), { key: 'Tab' });
    expect(useAnswer()).toBeDisabled();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The customer wrote again while the KB answer was found: the backend refuses to keep it as the
 * thread's suggestion (saved: false — it answers their earlier email). The agent confirms before it
 * goes into the reply (owner 2026-11-17, review round 16); a plain toast was easy to miss.
 */

const getSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const saveSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSuggestedAnswer: (...args: unknown[]) => getSuggestedAnswer(...args),
    saveSuggestedAnswer: (...args: unknown[]) => saveSuggestedAnswer(...args),
  },
}));
const translate = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => translate(...args) },
}));
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

const ANSWER = 'Your test order ships on Monday.';

const renderDialog = () => {
  const onSelectAnswer = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <SimilarMessagesDialog messageId={3} open onClose={onClose} onSelectAnswer={onSelectAnswer} />
    </MemoryRouter>
  );
  return { onSelectAnswer, onClose };
};

const clickUse = async () => {
  await screen.findByText(ANSWER);
  fireEvent.click(screen.getByRole('button', { name: /^Use AI Response$/ }));
  await waitFor(() => expect(saveSuggestedAnswer).toHaveBeenCalled());
};

beforeEach(() => {
  vi.clearAllMocks();
  getSuggestedAnswer.mockResolvedValue({
    success: true,
    data: {
      mode: 'ai-generated',
      aiResponse: { text: ANSWER, confidence: 0.95 },
      sources: [],
      searchPerformed: { documentation: true, tickets: true, messages: true },
    },
  });
});

describe('SimilarMessagesDialog — an answer for an earlier email', () => {
  it('refused: not inserted; the dialog asks first', async () => {
    saveSuggestedAnswer.mockResolvedValue({ data: { saved: false } });
    const { onSelectAnswer, onClose } = renderDialog();
    await clickUse();
    expect(await screen.findByText(/found for an earlier email/)).toBeVisible();
    expect(onSelectAnswer).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Insert anyway" puts it in the reply', async () => {
    saveSuggestedAnswer.mockResolvedValue({ data: { saved: false } });
    const { onSelectAnswer, onClose } = renderDialog();
    await clickUse();
    fireEvent.click(await screen.findByRole('button', { name: 'Insert anyway' }));
    expect(onSelectAnswer).toHaveBeenCalledWith(ANSWER, 'ai-generated');
    expect(onClose).toHaveBeenCalled();
  });

  it('"Don\'t insert" leaves the reply alone and the warning goes', async () => {
    saveSuggestedAnswer.mockResolvedValue({ data: { saved: false } });
    const { onSelectAnswer } = renderDialog();
    await clickUse();
    fireEvent.click(await screen.findByRole('button', { name: "Don't insert" }));
    expect(screen.queryByText(/found for an earlier email/)).not.toBeInTheDocument();
    expect(onSelectAnswer).not.toHaveBeenCalled();
  });

  it('CONTROL: kept as the suggestion — inserted at once, no question', async () => {
    saveSuggestedAnswer.mockResolvedValue({ data: { saved: true } });
    const { onSelectAnswer } = renderDialog();
    await clickUse();
    await waitFor(() => expect(onSelectAnswer).toHaveBeenCalledWith(ANSWER, 'ai-generated'));
    expect(screen.queryByText(/found for an earlier email/)).not.toBeInTheDocument();
  });

  it('while it asks, "Use" is off (no second refused save)', async () => {
    saveSuggestedAnswer.mockResolvedValue({ data: { saved: false } });
    renderDialog();
    await clickUse();
    await screen.findByText(/found for an earlier email/);
    // Out of use the design-system way (aria-disabled, its press cancelled — never native disabled).
    const useButton = screen.getByRole('button', { name: /^Use AI Response$/ });
    expect(useButton).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(useButton);
    expect(saveSuggestedAnswer).toHaveBeenCalledTimes(1);
  });

  it('the version chosen when "Insert anyway" is clicked is inserted (switched after the warning)', async () => {
    saveSuggestedAnswer.mockResolvedValue({ data: { saved: false } });
    translate.mockResolvedValue({
      data: {
        success: true,
        data: { translated: { content: 'Ihre Bestellung kommt am Montag.' } },
      },
    });
    const { onSelectAnswer } = renderDialog();
    await screen.findByText(ANSWER);
    fireEvent.click(screen.getByRole('button', { name: /^Translate$/ }));
    await screen.findByText('Ihre Bestellung kommt am Montag.');
    fireEvent.click(screen.getByRole('radio', { name: /use translated response/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Use Translated Response$/ }));
    await waitFor(() => expect(saveSuggestedAnswer).toHaveBeenCalled());
    // The original goes with a translation, so the backend knows the email it answers (round 18).
    expect(saveSuggestedAnswer).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        answer: 'Ihre Bestellung kommt am Montag.',
        computedAnswer: ANSWER,
      })
    );
    fireEvent.click(screen.getByRole('radio', { name: /use original response/i }));
    // Switched back to the original after the warning: "Insert anyway" inserts the original.
    fireEvent.click(await screen.findByRole('button', { name: 'Insert anyway' }));
    expect(onSelectAnswer).toHaveBeenCalledWith(ANSWER, 'ai-generated');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Translating the AI reply is for checking its meaning. The original — the customer's language —
 * must stay available and stay the default: after a translation the dialog offered only "Use
 * Translated Response", so agents translated the English back (support request 2026-10-20).
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
// The language picker needs the app's ThemeProvider; the default language (en) is what is used.
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { SimilarMessagesDialog } from '../SimilarMessagesDialog';

const ORIGINAL = 'Bonjour, votre commande test est bien arrivée.';
const ENGLISH = 'Hello, your test order arrived safely.';
const ENGLISH_AGAIN = 'Hi, your test order has arrived.';

const translated = (content: string) =>
  Promise.resolve({ data: { success: true, data: { translated: { content } } } });

const renderDialog = () => {
  const onSelectAnswer = vi.fn();
  render(
    <MemoryRouter>
      <SimilarMessagesDialog
        messageId={3}
        open
        onClose={() => {}}
        onSelectAnswer={onSelectAnswer}
      />
    </MemoryRouter>
  );
  return onSelectAnswer;
};

const translateNow = async (expected: string) => {
  fireEvent.click(screen.getByRole('button', { name: /^Translate$/ }));
  await screen.findByText(expected);
};

const use = async (label: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(saveSuggestedAnswer).toHaveBeenCalled());
};

beforeEach(() => {
  vi.clearAllMocks();
  getSuggestedAnswer.mockResolvedValue({
    success: true,
    data: {
      mode: 'ai-generated',
      aiResponse: { text: ORIGINAL, confidence: 0.95 },
      sources: [],
      searchPerformed: { documentation: true, tickets: true, messages: true },
    },
  });
  saveSuggestedAnswer.mockResolvedValue({});
  translate.mockImplementation(() => translated(ENGLISH));
});

describe('SimilarMessagesDialog — the original reply survives a translation', () => {
  it('after translating, both versions show, the original is selected, and one click uses it', async () => {
    const onSelectAnswer = renderDialog();
    await screen.findByText(ORIGINAL);
    await translateNow(ENGLISH);

    expect(screen.getByText(ORIGINAL)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /use original response/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /use translated response/i })).not.toBeChecked();

    await use(/^Use Original Response$/);
    expect(onSelectAnswer).toHaveBeenCalledWith(ORIGINAL, 'ai-generated');
  });

  it('the agent can switch to the translation and back as often as they like', async () => {
    const onSelectAnswer = renderDialog();
    await screen.findByText(ORIGINAL);
    await translateNow(ENGLISH);

    fireEvent.click(screen.getByRole('radio', { name: /use translated response/i }));
    expect(screen.getByRole('button', { name: /^Use Translated Response$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /use original response/i }));
    fireEvent.click(screen.getByRole('radio', { name: /use translated response/i }));

    await use(/^Use Translated Response$/);
    expect(onSelectAnswer).toHaveBeenCalledWith(ENGLISH, 'ai-generated');
  });

  it('translating again keeps the original, translates the ORIGINAL, and selects it again', async () => {
    renderDialog();
    await screen.findByText(ORIGINAL);
    await translateNow(ENGLISH);
    fireEvent.click(screen.getByRole('radio', { name: /use translated response/i }));

    translate.mockImplementation(() => translated(ENGLISH_AGAIN));
    await translateNow(ENGLISH_AGAIN);

    expect(screen.getByText(ORIGINAL)).toBeInTheDocument();
    expect(translate).toHaveBeenLastCalledWith('/api/translation/text/translate', {
      text: ORIGINAL,
      targetLanguage: 'en',
    });
    expect(screen.getByRole('radio', { name: /use original response/i })).toBeChecked();
  });

  it('control: without a translation the reply is used as it is, no version choice shown', async () => {
    const onSelectAnswer = renderDialog();
    await screen.findByText(ORIGINAL);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(ORIGINAL));
    await use(/^Use AI Response$/);
    expect(onSelectAnswer).toHaveBeenCalledWith(ORIGINAL, 'ai-generated');
  });
});

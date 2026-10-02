import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * SimilarMessagesDialog: the "use" path really hands the chosen text to the reply, the chosen card
 * (and only it) shows the selection ring, choosable cards look clickable, and "Use original
 * instead" appears only when there is a reply to put it in.
 */

const getSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const saveSuggestedAnswer = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: {
    getSuggestedAnswer: (...args: unknown[]) => getSuggestedAnswer(...args),
    saveSuggestedAnswer: (...args: unknown[]) => saveSuggestedAnswer(...args),
  },
}));
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));
vi.mock('@/hooks/useTranslation', () => ({
  useSupportedLanguages: () => ({
    languages: [{ code: 'en', name: 'English' }],
    fetchLanguages: () => Promise.resolve(),
  }),
}));
vi.mock('@/components/ui/ReactSelect', () => ({ ReactSelect: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { SimilarMessagesDialog } from '../SimilarMessagesDialog';

const AI_TEXT = 'Your parcel ships tomorrow.';
const TRANSLATED = 'Ihr Paket wird morgen versandt.';

const respondAi = () =>
  getSuggestedAnswer.mockResolvedValue({
    success: true,
    data: {
      mode: 'ai-generated',
      aiConfigured: true,
      aiResponse: { text: AI_TEXT, confidence: 0.92 },
      sources: [],
    },
  });

const renderDialog = (onSelectAnswer?: (answer: string, source?: string) => void) =>
  render(
    <MemoryRouter>
      <SimilarMessagesDialog
        messageId={41}
        open
        onClose={() => {}}
        onSelectAnswer={onSelectAnswer}
      />
    </MemoryRouter>
  );

const aiCard = async () =>
  (await screen.findByText('AI-Generated Response')).closest('.border-2') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  saveSuggestedAnswer.mockResolvedValue({ success: true });
  post.mockResolvedValue({
    data: { success: true, data: { translated: { content: TRANSLATED } } },
  });
});

describe('SimilarMessagesDialog — the AI card with an answer handler', () => {
  it('choosing the AI card and "Use AI Response" hands the AI text to the reply', async () => {
    respondAi();
    const onSelectAnswer = vi.fn();
    renderDialog(onSelectAnswer);
    const card = await aiCard();
    expect(card.className).toContain('cursor-pointer');
    expect(card.className).toContain('hover:border-primary');
    expect(card.className).not.toContain('ring-2');
    fireEvent.click(card);
    expect(card.className).toContain('ring-2');
    expect(card.className).toContain('border-primary');
    fireEvent.click(screen.getByRole('button', { name: /Use AI Response/ }));
    await waitFor(() => expect(onSelectAnswer).toHaveBeenCalledWith(AI_TEXT, 'ai-generated'));
  });

  it('with a translation shown, "Use original instead" puts the untranslated answer in', async () => {
    respondAi();
    const onSelectAnswer = vi.fn();
    renderDialog(onSelectAnswer);
    const card = await aiCard();
    fireEvent.click(card);
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByText(TRANSLATED)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use original instead' }));
    await waitFor(() => expect(onSelectAnswer).toHaveBeenCalledWith(AI_TEXT, 'ai-generated'));
  });

  it('read-only (no handler): the translation shows but no "Use original instead"', async () => {
    respondAi();
    renderDialog(undefined);
    await aiCard();
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByText(TRANSLATED)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use original instead' })).toBeNull();
  });
});

describe('SimilarMessagesDialog — source cards', () => {
  const SOURCES = [
    {
      messageId: 1,
      content: 'Where is my order?',
      subject: 'First source',
      directReply: 'It ships today.',
      similarity: 0.9,
      source: 'message' as const,
    },
    {
      messageId: 2,
      content: 'Can I return it?',
      subject: 'Second source',
      directReply: 'Yes, within 30 days.',
      similarity: 0.8,
      source: 'message' as const,
    },
  ];

  it('only the chosen source card carries the ring; the other stays clickable-looking', () => {
    render(
      <MemoryRouter>
        <SimilarMessagesDialog
          messageId={42}
          open
          onClose={() => {}}
          onSelectAnswer={() => {}}
          preloadedSources={SOURCES}
        />
      </MemoryRouter>
    );
    const first = screen.getByText('First source').closest('[role="button"]') as HTMLElement;
    const second = screen.getByText('Second source').closest('[role="button"]') as HTMLElement;
    expect(first.className).toContain('cursor-pointer');
    expect(first.className).toContain('hover:border-primary');
    expect(first.className).not.toContain('ring-2');
    fireEvent.click(second);
    expect(second.className).toContain('ring-2');
    expect(first.className).not.toContain('ring-2');
    expect(first.className).toContain('cursor-pointer');
    expect(first.className).toContain('hover:border-primary');
  });

  it('"Use This Answer" on a chosen source hands that source\'s reply over', async () => {
    const onSelectAnswer = vi.fn();
    render(
      <MemoryRouter>
        <SimilarMessagesDialog
          messageId={43}
          open
          onClose={() => {}}
          onSelectAnswer={onSelectAnswer}
          preloadedSources={SOURCES}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Second source').closest('[role="button"]') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /Use This Answer/ }));
    await waitFor(() =>
      expect(onSelectAnswer).toHaveBeenCalledWith('Yes, within 30 days.', 'message')
    );
  });
});

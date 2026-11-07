import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * SimilarMessagesDialog: the "use" path really hands the AI text to the reply, the AI card is the
 * only choice, and sources are reference only — never a choice (2026-10-20).
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
vi.mock('@/components/ui/Select', () => ({ Select: () => null }));
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
  it('the AI card is the choice from the start; "Use AI Response" hands the AI text to the reply', async () => {
    respondAi();
    const onSelectAnswer = vi.fn();
    renderDialog(onSelectAnswer);
    const card = await aiCard();
    expect(card.className).toContain('ring-2');
    expect(card.className).toContain('border-primary');
    fireEvent.click(screen.getByRole('button', { name: /Use AI Response/ }));
    await waitFor(() => expect(onSelectAnswer).toHaveBeenCalledWith(AI_TEXT, 'ai-generated'));
  });

  it('with a translation shown, the untranslated answer is still what goes in by default', async () => {
    respondAi();
    const onSelectAnswer = vi.fn();
    renderDialog(onSelectAnswer);
    const card = await aiCard();
    fireEvent.click(card);
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByText(TRANSLATED)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Use Original Response$/ }));
    await waitFor(() => expect(onSelectAnswer).toHaveBeenCalledWith(AI_TEXT, 'ai-generated'));
  });

  it('read-only (no handler): both versions show, but neither is offered as a choice', async () => {
    respondAi();
    renderDialog(undefined);
    await aiCard();
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
    expect(await screen.findByText(TRANSLATED)).toBeInTheDocument();
    expect(screen.getByText(AI_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText(/Will be used|Click to use this version/)).toBeNull();
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

  const renderSources = (onSelectAnswer = vi.fn()) => {
    render(
      <MemoryRouter>
        <SimilarMessagesDialog
          messageId={42}
          open
          onClose={() => {}}
          onSelectAnswer={onSelectAnswer}
          preloadedSources={SOURCES}
        />
      </MemoryRouter>
    );
    return onSelectAnswer;
  };
  const sourceCard = (title: string) =>
    screen.getByText(title).closest('.rounded-lg') as HTMLElement;

  it('a source cannot be chosen: no button role, no tab stop, no ring, by click or by key', () => {
    renderSources();
    const second = sourceCard('Second source');
    expect(second.closest('[role="button"]')).toBeNull();
    expect(second.closest('[tabindex]:not([tabindex="-1"])')).toBeNull();
    fireEvent.click(second);
    fireEvent.keyDown(second, { key: 'Enter' });
    fireEvent.keyDown(second, { key: ' ' });
    expect(second.className).not.toContain('ring-2');
    expect(screen.queryByText('Selected')).toBeNull();
  });

  it('with only sources there is nothing to use: no "use" button, the footer closes, nothing is handed over', () => {
    const onSelectAnswer = renderSources();
    fireEvent.click(sourceCard('Second source'));
    expect(screen.queryByRole('button', { name: /^Use |Insert source text/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    expect(onSelectAnswer).not.toHaveBeenCalled();
  });

  it('the source text stays readable', () => {
    renderSources();
    expect(screen.getByText('Yes, within 30 days.')).toBeInTheDocument();
    expect(screen.getByText('Can I return it?')).toBeInTheDocument();
  });
});

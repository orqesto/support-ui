/**
 * The draft card in the thread (2026-11-24):
 *  - a reply that check-only mode kept instead of sending, or one a check held, shows what became
 *    of it — "Check only · would have been sent" / "Held · <reason in words>" — in its own colour;
 *    an ordinary draft, and a draft from an older backend that records neither, shows no status;
 *  - it can be translated to read, as every customer message can (the same TranslateButton and
 *    text-translate call); "Show original" goes back, and the insert stays the original.
 * Invented data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

type Translated = { translated: { content: string; language: string } };
const translateText = vi.fn<(text: string, language: string) => Promise<Translated>>();
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    translateMessage: vi.fn(),
    translateTicket: vi.fn(),
    translateText: (text: string, language: string) => translateText(text, language),
    isTranslating: false,
    error: null,
  }),
  useSupportedLanguages: () => ({
    languages: [{ code: 'de', name: 'German' }],
    isLoading: false,
    fetchLanguages: () => Promise.resolve(),
  }),
}));
vi.mock('@/hooks/useAiConfigured', () => ({
  useAiConfigured: () => ({ aiConfigured: true, isLoading: false }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { MessageGhostBubble } from '../MessageGhostBubble';
import { toGhostOption, type SuggestedAnswerMeta } from '../messageDetailConstants';

const ANSWER = 'We are open until six on Fridays.';
const onGhostClick = vi.fn();
const show = (stored: SuggestedAnswerMeta) =>
  render(
    <MessageGhostBubble
      aiLoading={false}
      ghostVisible
      ghostOption={toGhostOption(stored)}
      autoReply={undefined}
      composer=""
      composerMode="reply"
      resolved={false}
      alternativeCount={0}
      onGhostClick={onGhostClick}
      onShowAlternatives={() => undefined}
    />
  );
const card = () => screen.getByText('Tap to insert into reply').parentElement as HTMLElement;

beforeEach(() => {
  translateText.mockReset();
  onGhostClick.mockReset();
});
afterEach(cleanup);

describe('the draft card says what became of an automatic reply', () => {
  it('check-only: "would have been sent", in the success colour', () => {
    show({ answer: ANSWER, source: 'documentation', confidence: 0.93, wouldSend: true });
    const badge = screen.getByText('Check only · would have been sent');
    expect(badge.className).toMatch(/border-success-line/);
    expect(card().className).toMatch(/border-success-line/);
    expect(card().className).not.toMatch(/border-ai-line/);
  });

  it('a keyword rule kept in check-only mode says it too', () => {
    show({
      answer: ANSWER,
      source: 'keyword_rule',
      keywordRule: { id: 2, name: 'Hours' },
      wouldSend: true,
    });
    expect(screen.getByText('Check only · would have been sent')).toBeInTheDocument();
    expect(screen.getByText('Keyword rule "Hours"')).toBeInTheDocument();
  });

  it('held for confidence: the score and the bar, in the warning colour', () => {
    show({
      answer: ANSWER,
      source: 'documentation',
      confidence: 0.82,
      heldReason: 'low_confidence',
      heldThreshold: 0.9,
    });
    const badge = screen.getByText('Held · confidence 82% below 90%');
    expect(badge.className).toMatch(/border-warning-line/);
    expect(card().className).toMatch(/border-warning-line/);
  });

  it('held by a check: the reason in plain words, never the code', () => {
    show({ answer: ANSWER, source: 'documentation', heldReason: 'promises_follow_up' });
    expect(screen.getByText('Held · the reply promised a follow-up')).toBeInTheDocument();
    expect(screen.queryByText(/promises_follow_up/)).toBeNull();
  });

  it('a reason this bundle does not know reads in words too', () => {
    show({ answer: ANSWER, heldReason: 'a_reason_added_later' });
    expect(screen.getByText('Held · held for a person')).toBeInTheDocument();
  });

  it('CONTROL: an ordinary draft (or an older backend with no record) shows no status, AI colour', () => {
    show({ answer: ANSWER, source: 'documentation', confidence: 0.93 });
    expect(screen.queryByText(/Check only|Held ·/)).toBeNull();
    expect(card().className).toMatch(/border-ai-line/);
  });
});

describe('the draft card can be translated to read', () => {
  it('translates the draft text, shows it, goes back to the original; the insert stays the original', async () => {
    translateText.mockResolvedValue({
      translated: { content: 'Freitags bis sechs geöffnet.', language: 'de' },
    });
    show({ answer: ANSWER, source: 'documentation', wouldSend: true });
    fireEvent.click(screen.getByLabelText('Translate'));
    fireEvent.click(await screen.findByText('German'));
    await waitFor(() =>
      expect(screen.getByText('Freitags bis sechs geöffnet.')).toBeInTheDocument()
    );
    expect(translateText).toHaveBeenCalledWith(ANSWER, 'de');
    // Choosing a language never inserted the draft.
    expect(onGhostClick).not.toHaveBeenCalled();
    fireEvent.click(card());
    expect(onGhostClick).toHaveBeenCalledWith(ANSWER, expect.any(String));
    fireEvent.click(screen.getByLabelText('Show original'));
    expect(screen.getByText(ANSWER)).toBeInTheDocument();
    expect(screen.queryByText('Freitags bis sechs geöffnet.')).toBeNull();
  });
});

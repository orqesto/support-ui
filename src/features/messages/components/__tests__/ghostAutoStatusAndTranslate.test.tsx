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
import { NEEDS_REVIEW_REASON_DETAILS, NEEDS_REVIEW_REASON_LABELS } from '../aiFlagCopy';

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

  // 2026-11-25: a phrase of the workspace's own hold list is its own reason, named on the card.
  it('held by a listed phrase: "contains" and the phrase, in the warning colour', () => {
    show({
      answer: 'Delivery takes 3 to 5 working days.',
      source: 'documentation',
      heldReason: 'hold_phrase',
      heldPhrase: 'working day*',
    });
    const badge = screen.getByText('Held · contains "working day*"');
    expect(badge.className).toMatch(/border-warning-line/);
    expect(screen.queryByText(/restricted topic/)).toBeNull();
  });

  it("a phrase hold whose phrase was not stored reads in the reason's own words", () => {
    show({ answer: ANSWER, heldReason: 'hold_phrase' });
    expect(
      screen.getByText('Held · the reply contains a phrase this workspace holds')
    ).toBeInTheDocument();
  });

  it("CONTROL: older data (restricted_topic, no phrase) keeps today's text", () => {
    show({ answer: ANSWER, heldReason: 'restricted_topic' });
    expect(
      screen.getByText(
        'Held · the customer asks about a restricted topic, or the reply states an amount with a unit of measure'
      )
    ).toBeInTheDocument();
  });

  it('CONTROL: a phrase stored beside another reason is not shown as the hold', () => {
    show({ answer: ANSWER, heldReason: 'promises_follow_up', heldPhrase: 'working day*' });
    expect(screen.getByText('Held · the reply promised a follow-up')).toBeInTheDocument();
  });

  it('an unknown reason with a phrase still falls back to the generic held text', () => {
    show({ answer: ANSWER, heldReason: 'a_reason_added_later', heldPhrase: 'working day*' });
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

/*
  The automatic email asking for missing details (2026-11-25): a question check-only kept, or one a
  check held, is stored as the thread's draft with `kind: 'missing_info_question'` and shows on the
  same card, in the same colours. NEGATIVE CONTROL (seen to fail): without the `question` branch the
  badge reads as an answer ("Check only · would have been sent").
*/
describe('the missing-info question that was not sent shows on the card', () => {
  const QUESTION =
    'Thanks for your message. To help with this, could you tell us:\n\nWhat is your order number?';

  it('check-only: "question that would have been sent", the success colour, insert and translate', async () => {
    translateText.mockResolvedValue({
      translated: { content: 'Wie lautet Ihre Bestellnummer?', language: 'de' },
    });
    show({
      answer: QUESTION,
      source: 'missing_info',
      kind: 'missing_info_question',
      wouldSend: true,
    });
    const badge = screen.getByText('Check only · question that would have been sent');
    expect(badge.className).toMatch(/border-success-line/);
    expect(card().className).toMatch(/border-success-line/);
    expect(screen.getByText('AI question for missing details')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Translate'));
    fireEvent.click(await screen.findByText('German'));
    await waitFor(() =>
      expect(screen.getByText('Wie lautet Ihre Bestellnummer?')).toBeInTheDocument()
    );
    fireEvent.click(card());
    expect(onGhostClick).toHaveBeenCalledWith(QUESTION, expect.any(String));
  });

  it("held by the check of its questions: the check's finding in words, the warning colour", () => {
    show({
      answer: QUESTION,
      source: 'missing_info',
      kind: 'missing_info_question',
      heldReason: 'blocked_missing_info_model_check',
      checkReason: 'no_customer_request',
    });
    const badge = screen.getByText('Held · the message is not a customer request');
    expect(badge.className).toMatch(/border-warning-line/);
    expect(card().className).toMatch(/border-warning-line/);
    expect(screen.queryByText(/blocked_missing_info_model_check/)).toBeNull();
  });

  it('held by a listed phrase in its questions: "contains" and the phrase', () => {
    show({
      answer: QUESTION,
      source: 'missing_info',
      kind: 'missing_info_question',
      heldReason: 'blocked_missing_info_model_check',
      checkReason: 'hold_phrase',
      heldPhrase: 'order number',
    });
    expect(screen.getByText('Held · contains "order number"')).toBeInTheDocument();
  });

  // 1.1.330: a listed phrase has its own reason (`hold_phrase`), so the restricted-topic words no
  // longer name a held phrase; they still cover the built-in amount rule, which keeps
  // `restricted_topic` by design. The flag reads the same way.
  it('held on a restricted topic: no held phrase in the words, the amount rule still covered', () => {
    show({
      answer: QUESTION,
      source: 'missing_info',
      kind: 'missing_info_question',
      heldReason: 'blocked_missing_info_model_check',
      checkReason: 'restricted_topic',
    });
    const badge = screen.getByText(/^Held · the customer asks about a restricted topic/);
    expect(badge.textContent).toBe(
      'Held · the customer asks about a restricted topic, or a question in the email states an amount with a unit of measure, so nothing was asked automatically'
    );
    expect(badge.textContent).not.toMatch(/phrase|this workspace holds/);
    expect(NEEDS_REVIEW_REASON_LABELS.restricted_topic).toBe('Restricted topic or an amount');
    expect(NEEDS_REVIEW_REASON_LABELS.restricted_topic).not.toMatch(/phrase/i);
    expect(NEEDS_REVIEW_REASON_DETAILS.restricted_topic).not.toMatch(/phrase|this workspace holds/);
    expect(NEEDS_REVIEW_REASON_LABELS.hold_phrase).toBe('Held phrase');
  });

  it('held for another reason: the outcome in words (the sender limit, a failed send)', () => {
    show({
      answer: QUESTION,
      kind: 'missing_info_question',
      heldReason: 'sender_reply_limit',
    });
    expect(screen.getByText(/^Held · this sender already got the most/)).toBeInTheDocument();
    cleanup();
    show({ answer: QUESTION, kind: 'missing_info_question', heldReason: 'send_failed' });
    expect(screen.getByText('Held · the email could not be sent')).toBeInTheDocument();
  });

  it('CONTROL: no stored record — no card, no question badge', () => {
    render(
      <MessageGhostBubble
        aiLoading={false}
        ghostVisible
        ghostOption={toGhostOption(undefined)}
        autoReply={undefined}
        composer=""
        composerMode="reply"
        resolved={false}
        alternativeCount={0}
        onGhostClick={onGhostClick}
        onShowAlternatives={() => undefined}
      />
    );
    expect(screen.queryByText('Tap to insert into reply')).toBeNull();
    expect(screen.queryByText(/question that would have been sent|Held ·/)).toBeNull();
  });
});

/**
 * "No reply needed" (owner 2026-11-17): a customer email that only thanks or confirms gets no AI
 * draft; the backend marks the thread `metadata.noReplyNeeded = {eventId, at}`. The inbox card says
 * so while nothing on the row contradicts it, and the thread says so in place of "No suggestion
 * found" while that email is the customer's latest.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getAiState, noReplyNeededShown } from '../inboxCardHelpers';
import { MessageGhostBubble } from '../MessageGhostBubble';
import { noReplyNeededState } from '../messageDetail/storedDraftFreshness';
import type { Message, MessageEvent } from '@/types';
import type { MessageThread } from '@/services/message.service';

const thread = { isLead: false } as unknown as MessageThread;
const MARKED_AT = '2026-11-17T21:30:00.000Z';
const card = (metadata: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({
    id: 1,
    status: 'open',
    needsHumanReview: false,
    lastReplyFromClient: true,
    lastReplyAt: '2026-11-17T21:27:00.000Z',
    metadata,
    ...extra,
  }) as unknown as Message;
const marked = { noReplyNeeded: { eventId: 7, at: MARKED_AT } };

describe('inbox card — "No reply needed" chip', () => {
  it('shows for a thread the backend marked, the customer having written last', () => {
    expect(getAiState(card(marked), thread)?.label).toBe('No reply needed');
  });

  it('never promises the AI draft button (it is off when drafts are off)', () => {
    expect(getAiState(card(marked), thread)?.tooltip).not.toMatch(/still writes|by hand/);
  });

  it.each([
    ['no marker', card({})],
    ['a marker of another shape', card({ noReplyNeeded: true })],
    ['a string id', card({ noReplyNeeded: { eventId: '7', at: MARKED_AT } })],
    ['our reply is the last word', card(marked, { lastReplyFromClient: false })],
    ['a draft stored by hand', card({ ...marked, suggestedAnswer: { answer: 'hi' } })],
  ])('no chip with %s', (_label, message) => {
    expect(noReplyNeededShown(message, thread)).toBe(false);
  });

  it('a thread we never answered (lastReplyFromClient null) shows it — as the thread view does', () => {
    expect(noReplyNeededShown(card(marked, { lastReplyFromClient: null }), thread)).toBe(true);
  });

  it('trusts the backend marker: no row-time rule of its own (the backend clears a stale one)', () => {
    expect(noReplyNeededShown(card({ noReplyNeeded: { eventId: 7 } }), thread)).toBe(true);
  });

  it('a resolved or closed thread (its latest message) has no chip — the thread view shows none', () => {
    expect(noReplyNeededShown(card(marked, { status: 'resolved' }), thread)).toBe(false);
    const closedLatest = {
      ...thread,
      latestMessage: card(marked, { status: 'closed' }),
    } as MessageThread;
    expect(noReplyNeededShown(card(marked, { status: 'open' }), closedLatest)).toBe(false);
  });

  it("the row gives no reply flag: the thread's says our reply was last — no chip", () => {
    const answered = { ...thread, lastReplyFromClient: false } as unknown as MessageThread;
    expect(noReplyNeededShown(card(marked, { lastReplyFromClient: undefined }), answered)).toBe(
      false
    );
  });

  it('a stored draft (an object, as the backend filter reads it) hides the chip', () => {
    const stored = card({ ...marked, suggestedAnswer: { answer: 'old' } });
    expect(noReplyNeededShown(stored, thread)).toBe(false);
    // Not a draft object: the filter lists the thread, so the card shows the chip.
    expect(noReplyNeededShown(card({ ...marked, suggestedAnswer: 'text' }), thread)).toBe(true);
  });

  it('a review reason keeps its chip; a STALE "Auto-handled" from an earlier email does not', () => {
    expect(getAiState(card(marked, { needsHumanReview: true }), thread)?.label).toBe(
      'Needs review'
    );
    expect(getAiState(card({ ...marked, autoReply: { sent: true } }), thread)?.label).toBe(
      'No reply needed'
    );
    // CONTROL: without a marker the auto-replied thread still reads "Auto-handled".
    expect(getAiState(card({ autoReply: { sent: true } }), thread)?.label).toBe('Auto-handled');
    // The bot_handled filter's column decides when the list sends it (review of #980).
    expect(getAiState(card({}, { botHandled: true }), thread)?.label).toBe('Auto-handled');
    expect(
      getAiState(card({ autoReply: { sent: true } }, { botHandled: false }), thread)
    ).toBeNull();
  });
});

const event = (id: number, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type: 'inbound',
    metadata: { spamCheck: { category: 'legitimate' } },
    createdAt: `2026-11-17T1${id}:00:00Z`,
    ...extra,
  }) as unknown as MessageEvent;

describe('noReplyNeededState — the thread view', () => {
  const metadata = { noReplyNeeded: { eventId: 2 } };

  it('the marked email is the customer’s latest: shown', () => {
    expect(noReplyNeededState(metadata, [event(1), event(2)], 'loaded')).toEqual({
      current: true,
      pending: false,
    });
  });

  it('the customer wrote again after it (marker not cleared yet): not shown', () => {
    expect(noReplyNeededState(metadata, [event(1), event(2), event(3)], 'loaded').current).toBe(
      false
    );
  });

  it('CONTROL: an out-of-office after it is not the customer writing — still shown', () => {
    const ooo = event(3, { customerWriting: false });
    expect(noReplyNeededState(metadata, [event(1), event(2), ooo], 'loaded').current).toBe(true);
  });

  it('a newer live email still waiting for its verdict: pending — nothing shown yet', () => {
    // Just arrived (the wait is bounded to minutes): the marked email is from earlier today.
    const marked = event(2, { createdAt: new Date(Date.now() - 60_000).toISOString() });
    const unjudged = event(3, {
      metadata: {},
      customerWriting: false,
      createdAt: new Date().toISOString(),
    });
    expect(noReplyNeededState(metadata, [event(1), marked, unjudged], 'loaded')).toEqual({
      current: false,
      pending: true,
    });
  });

  it('a newer email still without a verdict after the wait: the thread follows the marker, as the chip', () => {
    const old = event(3, { metadata: {}, customerWriting: false });
    expect(noReplyNeededState(metadata, [event(1), event(2), old], 'loaded')).toEqual({
      current: true,
      pending: false,
    });
  });

  it('the marked email not loaded: "newer" is by id — an OLDER loaded id never waits (review of #980)', () => {
    const recent = (id: number) =>
      event(id, { metadata: {}, customerWriting: false, createdAt: new Date().toISOString() });
    // Marker 50 not loaded; 48 is older (no wait), 52 is newer and unjudged (waits).
    const marker = { noReplyNeeded: { eventId: 50 } };
    expect(noReplyNeededState(marker, [recent(48)], 'loaded').pending).toBe(false);
    expect(noReplyNeededState(marker, [recent(48), recent(52)], 'loaded').pending).toBe(true);
  });

  it('the marked email is NEWER than the loaded page (marker before its event): no wait', () => {
    const unjudged = event(3, {
      metadata: {},
      customerWriting: false,
      createdAt: new Date().toISOString(),
    });
    // Marker names email 9, above every loaded id: it is the newest — nothing loaded is newer.
    expect(
      noReplyNeededState({ noReplyNeeded: { eventId: 9 } }, [unjudged], 'loaded').pending
    ).toBe(false);
  });

  it('the marked email is not on the loaded page: every loaded email is newer (review of #979)', () => {
    const unjudged = event(3, {
      metadata: {},
      customerWriting: false,
      createdAt: new Date().toISOString(),
    });
    // Marker names email 1, which is on an earlier page; the page holds only the unjudged one.
    expect(noReplyNeededState({ noReplyNeeded: { eventId: 1 } }, [unjudged], 'loaded')).toEqual({
      current: false,
      pending: true,
    });
  });

  it('an import or a bounce after it never gets a verdict — not "waiting": the note shows', () => {
    const imported = event(3, { metadata: { historicalImport: true }, customerWriting: false });
    const bounce = event(4, { metadata: { deliveryFailure: true }, customerWriting: false });
    expect(noReplyNeededState(metadata, [event(2), imported, bounce], 'loaded').current).toBe(true);
  });

  it('events being read: pending (nothing shown yet); a failed read shows no note', () => {
    expect(noReplyNeededState(metadata, [], 'pending')).toEqual({ current: false, pending: true });
    expect(noReplyNeededState(metadata, [event(2)], 'failed')).toEqual({
      current: false,
      pending: false,
    });
    // CONTROL: no marker is never pending.
    expect(noReplyNeededState({}, [], 'pending').pending).toBe(false);
  });
});

const noop = () => undefined;
const renderEmptyBubble = (
  noReplyNeeded?: boolean,
  extra: { noReplyPending?: boolean; autoReply?: { sent?: boolean }; aiLoading?: boolean } = {}
) =>
  render(
    <MessageGhostBubble
      aiLoading={extra.aiLoading ?? false}
      ghostVisible
      ghostOption={null}
      autoReply={extra.autoReply}
      {...(extra.noReplyPending !== undefined ? { noReplyPending: extra.noReplyPending } : {})}
      composer=""
      composerMode="reply"
      resolved={false}
      {...(noReplyNeeded !== undefined ? { noReplyNeeded } : {})}
      alternativeCount={0}
      onGhostClick={noop}
      onShowAlternatives={noop}
    />
  );

describe('thread — no draft for a thank-you', () => {
  it('says why instead of "No suggestion found", and still points at the KB button', () => {
    renderEmptyBubble(true);
    expect(screen.getByText(/No reply needed/)).toBeInTheDocument();
    expect(screen.getByText('KB')).toBeInTheDocument();
    expect(screen.queryByText(/No suggestion found/)).not.toBeInTheDocument();
    expect(screen.queryByText(/still writes|by hand/)).not.toBeInTheDocument();
  });

  it('while the marker is checked: nothing, never "No suggestion found" or "Generating" first', () => {
    const { container } = renderEmptyBubble(false, { noReplyPending: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('a marked thread shows its note, not the similar-search spinner first', () => {
    renderEmptyBubble(true, { aiLoading: true });
    expect(screen.getByText(/No reply needed/)).toBeInTheDocument();
    expect(screen.queryByText(/Generating/)).not.toBeInTheDocument();
  });

  it('pending beats the spinner: a stored draft being checked never shows "Generating" first', () => {
    const { container } = renderEmptyBubble(false, { noReplyPending: true, aiLoading: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('after an earlier auto-reply only the NOTE opens — never the spinner', () => {
    const { container } = renderEmptyBubble(false, { autoReply: { sent: true }, aiLoading: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('an auto-reply to an EARLIER email does not hide the note for the latest thank-you', () => {
    renderEmptyBubble(true, { autoReply: { sent: true } });
    expect(screen.getByText(/No reply needed/)).toBeInTheDocument();
  });

  it('CONTROL: not marked — "No suggestion found" as before', () => {
    renderEmptyBubble();
    expect(screen.getByText(/No suggestion found/)).toBeInTheDocument();
  });
});

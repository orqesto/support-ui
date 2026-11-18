/**
 * "No reply needed" (owner 2026-11-17): a customer email that only thanks or confirms gets no AI
 * draft; the backend marks the thread `metadata.noReplyNeeded = {eventId, at}`. The inbox card says
 * so while nothing on the row contradicts it, and the thread says so in place of "No suggestion
 * found" while that email is the customer's latest.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { getAiState, noReplyNeededShown } from '../inboxCardHelpers';
import { MessageGhostBubble } from '../MessageGhostBubble';
import { useThreadEvents } from '../messageDetail/useThreadEvents';
import { messageService } from '@/services/message.service';
import type { Message, MessageEvent } from '@/types';
import type { MessageThread } from '@/services/message.service';

vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: vi.fn(),
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));

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

describe("thread view — the served marker is shown as it is (the rule is the backend's)", () => {
  const inbound = (id: number) => event(id);
  const mountThread = (metadata: Record<string, unknown>, events: MessageEvent[]) => {
    vi.spyOn(messageService, 'getThreadMessages').mockResolvedValue({
      data: events,
    } as unknown as Awaited<ReturnType<typeof messageService.getThreadMessages>>);
    const onStatusChanged = vi.fn();
    const message = { id: 41, channel: 'email', status: 'open', metadata } as unknown as Message;
    const hook = renderHook(
      (props: { message: Message }) => useThreadEvents(props.message, vi.fn(), onStatusChanged),
      { initialProps: { message } }
    );
    return { hook, onStatusChanged, message };
  };
  const marker = { noReplyNeeded: { eventId: 2 } };

  it('a served marker shows the note at once — no wait for the events, no rule of its own', async () => {
    const { hook, onStatusChanged } = mountThread(marker, [inbound(1), inbound(2)]);
    expect(hook.result.current.noReplyNeeded).toBe(true);
    await waitFor(() => expect(hook.result.current.threadEventsFor).toBe(41));
    expect(hook.result.current.noReplyNeeded).toBe(true);
    expect(onStatusChanged).not.toHaveBeenCalled();
  });

  it('a resolved or closed thread shows no note (its row carries the marker as stored)', () => {
    for (const status of ['resolved', 'closed']) {
      const { hook, message } = mountThread(marker, [inbound(2)]);
      hook.rerender({ message: { ...message, status } as unknown as Message });
      expect(hook.result.current.noReplyNeeded).toBe(false);
      hook.unmount();
    }
  });

  it('no marker served: no note', () => {
    const { hook } = mountThread({}, [inbound(1), inbound(2)]);
    expect(hook.result.current.noReplyNeeded).toBe(false);
  });

  it('an inbound event newer than the marked email re-reads the conversation, once; the answer decides', async () => {
    const { hook, onStatusChanged, message } = mountThread(marker, [
      inbound(1),
      inbound(2),
      inbound(3),
    ]);
    await waitFor(() => expect(onStatusChanged).toHaveBeenCalledTimes(1));
    // The re-read still serves the marker (the newer email was not the customer writing): shown.
    hook.rerender({ message: { ...message, metadata: { noReplyNeeded: { eventId: 2 } } } });
    expect(hook.result.current.noReplyNeeded).toBe(true);
    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    // The re-read serves none (the customer wrote again): gone.
    hook.rerender({ message: { ...message, metadata: {} } });
    expect(hook.result.current.noReplyNeeded).toBe(false);
  });

  it('CONTROL: an outgoing event or a note after the marked email re-reads nothing', async () => {
    const ours = event(3, { type: 'outbound' });
    const { hook, onStatusChanged } = mountThread(marker, [inbound(2), ours]);
    await waitFor(() => expect(hook.result.current.threadEventsFor).toBe(41));
    expect(onStatusChanged).not.toHaveBeenCalled();
  });
});

const noop = () => undefined;
const renderEmptyBubble = (
  noReplyNeeded?: boolean,
  extra: { autoReply?: { sent?: boolean }; aiLoading?: boolean } = {}
) =>
  render(
    <MessageGhostBubble
      aiLoading={extra.aiLoading ?? false}
      ghostVisible
      ghostOption={null}
      autoReply={extra.autoReply}
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

  it('a marked thread shows its note, not the similar-search spinner first', () => {
    renderEmptyBubble(true, { aiLoading: true });
    expect(screen.getByText(/No reply needed/)).toBeInTheDocument();
    expect(screen.queryByText(/Generating/)).not.toBeInTheDocument();
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

/**
 * A card's age must be LATEST ACTIVITY, not when the thread started.
 *
 * Reported from the taco board: COR-SUP-361 showed "6d" while the newest message in
 * it was a customer reply from 48 minutes earlier. The card rendered
 * `metadata.receivedAt`, which is stamped from the message that CREATED the
 * conversation and never moves. The list view — same data, same request — already
 * preferred `thread.lastMessageAt`, so the two views disagreed about the same thread.
 *
 * On a board sorted newest-first that is actively misleading: the thread that just
 * moved looks like the most neglected one.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MessageThread } from '@/services/message.service';
import { KanbanCard } from '../KanbanCard';

const aiDrafts = vi.hoisted(() => ({ off: false }));
vi.mock('@/hooks/useAiDraftsOff', () => ({
  useAiDraftsOff: () => ({ off: aiDrafts.off, resolved: true }),
  useRefreshAiDrafts: () => () => undefined,
}));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));

afterEach(() => {
  cleanup();
  aiDrafts.off = false;
});

const HOUR = 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

// Loose overrides on purpose: the declared `MessageThread.lastMessageAt` is a `Date`,
// but the field arrives over the wire as an ISO string and `formatAge` accepts both.
// The fixtures below use whichever form the assertion is about.
const thread = (over: Record<string, unknown>): MessageThread =>
  ({
    threadId: 'conv_361',
    publicId: 'COR-SUP-361',
    sender: 'info@coresarms.co.uk',
    subject: 'Re: Your order from CORE SARMS - UK is on its way!',
    status: 'in_progress',
    priority: 'medium',
    // Thread opened six days ago...
    lastMessageAt: iso(6 * 24 * HOUR),
    latestMessage: {
      id: 1,
      conversationId: 361,
      type: 'inbound',
      content: 'any update on my parcel',
      channel: 'email',
      createdAt: iso(6 * 24 * HOUR),
      metadata: { receivedAt: iso(6 * 24 * HOUR) },
    },
    ...over,
  }) as unknown as MessageThread;

describe('KanbanCard — age', () => {
  it('shows the age of the latest activity, not the thread start', () => {
    // ...but answered 48 minutes ago. The card must say minutes, not days.
    const recent = thread({ lastMessageAt: iso(48 * 60 * 1000) });
    render(<KanbanCard thread={recent} onOpen={() => {}} />);
    expect(screen.queryByText('6d')).toBeNull();
  });

  it('falls back to the creating message when the thread carries no activity stamp', () => {
    // Older rows and channels without one must not render a blank or "NaN".
    const noStamp = thread({ lastMessageAt: undefined });
    render(<KanbanCard thread={noStamp} onOpen={() => {}} />);
    expect(screen.getByText('6d')).toBeTruthy();
  });
});

// The chip reads "AI suggested — review and send" off a stored draft. With AI drafts off that
// draft is not offered anywhere, so the card must not send the agent looking for it.
describe('KanbanCard — AI state chip with AI drafts off', () => {
  const withStoredDraft = () =>
    thread({
      latestMessage: {
        id: 1,
        conversationId: 361,
        type: 'inbound',
        content: 'any update on my parcel',
        channel: 'email',
        createdAt: iso(HOUR),
        needsHumanReview: true,
        metadata: { suggestedAnswer: { answer: 'A stored draft.' } },
      },
    });

  it('reads "Needs review" with drafts off', () => {
    aiDrafts.off = true;
    render(<KanbanCard thread={withStoredDraft()} onOpen={() => {}} />);
    expect(screen.queryByText('AI suggested')).toBeNull();
    expect(screen.getByText('Needs review')).toBeTruthy();
  });

  it('reads "AI suggested" with drafts on (control)', () => {
    render(<KanbanCard thread={withStoredDraft()} onOpen={() => {}} />);
    expect(screen.getByText('AI suggested')).toBeTruthy();
  });
});

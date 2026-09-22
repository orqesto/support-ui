/**
 * Ticking a card's box must NOT open the thread.
 *
 * The whole card is a button, so the checkbox sits inside a click target that navigates. An
 * agent triaging fifty threads is picking them precisely to avoid opening each one; a
 * checkbox that also opens the thread makes the feature slower than doing it by hand.
 *
 * Also here: a rule-blocked spam-log row gets NO box. It has no conversation behind it
 * (`spamlog_<n>`, negative id), so every bulk action refuses it — offering it would be an
 * invitation to a guaranteed refusal.
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { MessageThread } from '@/services/message.service';
import { KanbanCard } from '../KanbanCard';

vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'COR' }));

afterEach(cleanup);

const thread = (over: Record<string, unknown> = {}): MessageThread =>
  ({
    threadId: 'conv_361',
    publicId: 'COR-SUP-361',
    sender: 'customer@example.com',
    subject: 'Where is my order?',
    status: 'in_progress',
    priority: 'medium',
    lastMessageAt: new Date().toISOString(),
    latestMessage: {
      id: 361,
      conversationId: 361,
      type: 'inbound',
      content: 'any update?',
      channel: 'email',
      createdAt: new Date().toISOString(),
      metadata: {},
    },
    ...over,
  }) as unknown as MessageThread;

describe('KanbanCard — bulk selection', () => {
  it('toggles the selection without opening the thread', () => {
    const onOpen = vi.fn();
    const onToggleSelected = vi.fn();
    render(
      <KanbanCard thread={thread()} onOpen={onOpen} onToggleSelected={onToggleSelected} />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /select message/i }));

    // ⛔ Exactly ONCE. `toHaveBeenCalledWith` alone passed while the wrapper and the input each
    // fired it — one click toggled on and back off, so no box could ever be ticked. Only the
    // browser showed it; jsdom was happy.
    expect(onToggleSelected).toHaveBeenCalledTimes(1);
    expect(onToggleSelected).toHaveBeenCalledWith(361);
    // The point of the test: the detail pane must stay shut.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('puts the checkbox in the card’s TOP-RIGHT corner (owner’s call)', () => {
    // Asserted through the class rather than geometry: jsdom computes no layout, so a position
    // test here can only check the instruction, not the result. The rendered position was
    // measured in a real browser (7px from the card's right edge, clear of the drag grip).
    const { container } = render(
      <KanbanCard thread={thread()} onOpen={vi.fn()} onToggleSelected={vi.fn()} />
    );
    const box = container.querySelector('input[type="checkbox"]');
    const corner = box?.closest('[class*="absolute"]');
    expect(corner?.className).toContain('right-1.5');
    expect(corner?.className).toContain('top-1.5');
    expect(corner?.className).not.toContain('left-');
    // And the header row reserves space for it, so it cannot land on the age (owner's report).
    expect(container.querySelector('.pr-14')).not.toBeNull();
  });

  it('draws no checkbox at all when the board is not in selection mode', () => {
    render(<KanbanCard thread={thread()} onOpen={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('draws no checkbox on a rule-blocked spam-log row', () => {
    // Negative id, `spamlog_` thread id: there is no conversation to act on.
    const spamLog = thread({
      threadId: 'spamlog_44',
      latestMessage: {
        id: -44,
        conversationId: -44,
        type: 'inbound',
        content: 'blocked by a rule',
        channel: 'email',
        createdAt: new Date().toISOString(),
        metadata: {},
      },
    });
    render(<KanbanCard thread={spamLog} onOpen={vi.fn()} onToggleSelected={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

/**
 * Owner, 2026-09-22 — two layers of spam: what our filters bin is UNCONFIRMED; any agent action
 * that puts a thread in spam is CONFIRMED. These are the two agent paths outside the header caret
 * and Needs Routing (both tested where they live).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Message } from '@/types';
import { MessageActionStrip } from '../MessageActionStrip';
import { dndConfirmsSpam, getDndAction } from '../kanbanColumns';

afterEach(cleanup);

describe('suspicious banner — Resolve & move to spam', () => {
  it('is labelled as a resolve and sends move_to_spam WITH confirm', async () => {
    const onClassify = vi.fn().mockResolvedValue(undefined);
    render(
      <MessageActionStrip
        message={
          {
            id: 1,
            channel: 'email',
            sender: 'a@b.example',
            subject: 'x',
            status: 'open',
            createdAt: '2026-09-22T10:00:00Z',
            metadata: { spamCheck: { category: 'suspicious' } },
          } as unknown as Message
        }
        isFiltered={false}
        isSuspicious
        isActive={false}
        hasLinkedTicket={false}
        onReopen={vi.fn()}
        onDelete={vi.fn()}
        onClassify={onClassify}
        setReopenDialogOpen={vi.fn()}
        onRefresh={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Resolve & move to spam/ }));
    await waitFor(() => expect(onClassify).toHaveBeenCalledTimes(1));
    expect(onClassify).toHaveBeenCalledWith('move_to_spam', undefined, false, true);
  });

  it('stacks Approve over the spam decision in one right-aligned column (owner, 2026-09-23)', () => {
    render(
      <MessageActionStrip
        message={
          {
            id: 1,
            channel: 'email',
            sender: 'a@b.example',
            subject: 'x',
            status: 'open',
            createdAt: '2026-09-22T10:00:00Z',
            metadata: { spamCheck: { category: 'suspicious' } },
          } as unknown as Message
        }
        isFiltered={false}
        isSuspicious
        isActive={false}
        hasLinkedTicket={false}
        onReopen={vi.fn()}
        onDelete={vi.fn()}
        onClassify={vi.fn().mockResolvedValue(undefined)}
        setReopenDialogOpen={vi.fn()}
        onRefresh={vi.fn()}
      />
    );
    // jsdom has no layout: pin the STRUCTURE — one shared column, approve first.
    const approve = screen.getByRole('button', { name: /Not Spam — Approve/ });
    const spam = screen.getByRole('button', { name: /Resolve & move to spam/ });
    const column = approve.parentElement!;
    expect(spam.parentElement).toBe(column);
    expect(column.className).toMatch(/\bflex-col\b/);
    expect(column.className).toMatch(/\bml-auto\b/);
    expect(column.firstElementChild).toBe(approve);
  });
});

describe('kanban drag onto Spam', () => {
  it('confirms: a drag is an agent decision', () => {
    const action = getDndAction('not_analysed', 'spam');
    expect(action).toBe('move_to_spam');
    expect(dndConfirmsSpam(action!)).toBe(true);
  });
  it('CONTROL: approve and reopen carry no spam confirmation', () => {
    expect(dndConfirmsSpam('approve')).toBe(false);
    expect(dndConfirmsSpam('reopen')).toBe(false);
  });
});

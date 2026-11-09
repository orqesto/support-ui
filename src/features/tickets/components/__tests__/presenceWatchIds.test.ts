import { describe, it, expect } from 'vitest';
import type { Message } from '@/types';
import { presenceWatchIds } from '../presenceWatchIds';

const msg = (id: number, over: Partial<Message> = {}): Message =>
  ({ id, createdAt: '2026-11-01T00:00:00Z', ...over }) as Message;

describe('presenceWatchIds', () => {
  it('orders by last activity, newest first', () => {
    const { ids, total } = presenceWatchIds(
      [
        msg(1, { updatedAt: '2026-11-03T00:00:00Z' }),
        msg(2, { lastReplyAt: '2026-11-05T00:00:00Z' }),
        msg(3),
      ],
      50
    );
    expect(ids).toEqual([2, 1, 3]);
    expect(total).toBe(3);
  });

  it('keeps only the most recent `cap` and reports the full count', () => {
    const list = Array.from({ length: 70 }, (_, idx) =>
      msg(idx + 1, { updatedAt: new Date(Date.UTC(2026, 10, 1, 0, idx)).toISOString() })
    );
    const { ids, total } = presenceWatchIds(list, 50);
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe(70);
    expect(ids).not.toContain(1);
    expect(total).toBe(70);
  });

  it('is empty for no threads', () => {
    expect(presenceWatchIds([], 50)).toEqual({ ids: [], total: 0 });
  });
});

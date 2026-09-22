/**
 * J/K did nothing when a thread was opened from a link or after a reload: the page recorded the
 * open conversation only on a row CLICK. This recovers it from the loaded threads.
 */
import { describe, it, expect } from 'vitest';
import { threadIdForMessage } from '../threadForMessage';

const thread = (threadId: string, latest: number | null, incoming: number | null) => ({
  threadId,
  latestMessage: latest === null ? null : { id: latest },
  latestIncomingMessage: incoming === null ? null : { id: incoming },
});

const threads = [thread('t-1', 10, 9), thread('t-2', 20, 20), thread('t-3', null, 30)];

describe('threadIdForMessage', () => {
  it('matches the thread whose LATEST message is the open one', () => {
    expect(threadIdForMessage(threads, 10)).toBe('t-1');
  });

  it('matches the thread whose latest INCOMING message is the open one (what the list opens)', () => {
    expect(threadIdForMessage(threads, 9)).toBe('t-1');
    expect(threadIdForMessage(threads, 30)).toBe('t-3');
  });

  it('a message deeper in a thread matches nothing — null, never a neighbouring thread', () => {
    expect(threadIdForMessage(threads, 5)).toBeNull();
  });

  it('no open message, or none loaded yet, is null', () => {
    expect(threadIdForMessage(threads, null)).toBeNull();
    expect(threadIdForMessage(threads, undefined)).toBeNull();
    expect(threadIdForMessage([], 10)).toBeNull();
  });

  it('a thread with no messages at all does not match a null id', () => {
    expect(threadIdForMessage([thread('t-4', null, null)], null)).toBeNull();
  });
});

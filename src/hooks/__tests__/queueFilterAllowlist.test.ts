/**
 * The URL layer's allowlist and the filter type must be ONE list.
 *
 * They were two. `useMessagesUrlSync` kept its own `VALID_QUEUES` array, and a queue value
 * present in the type but absent from that array does not fail loudly — it applies, the
 * list changes, and the next URL sync silently resets it to `all`. The user sees a filter
 * work and then undo itself, which reads as a flaky app rather than a missing entry.
 *
 * `outbound_echo` walked straight into it: it is the only lens that reaches our own sent
 * mail with no inbound parent, and the scope notice links to it, so a reset here would
 * have made that link land on the unfiltered list — the "clickable number that disagrees
 * with its destination" failure the notice was built to end.
 */
import { describe, it, expect } from 'vitest';
import { QUEUE_FILTERS, type QueueFilter } from '@/stores/messagesStore';
import { VALID_QUEUES } from '@/hooks/useMessagesUrlSync';

describe('queue filter allowlist', () => {
  it('the URL allowlist IS the filter list, not a copy of it', () => {
    // Identity, not equality: a copy that happens to match today is the state this
    // regressed from. Only sharing the reference makes the pair impossible to desync.
    expect(VALID_QUEUES).toBe(QUEUE_FILTERS);
  });

  it('accepts outbound_echo, the lens with no kanban column', () => {
    expect(VALID_QUEUES as readonly string[]).toContain('outbound_echo');
    // Control: the allowlist rejects something, so `toContain` above means something.
    expect(VALID_QUEUES as readonly string[]).not.toContain('not_a_queue');
  });

  it('every value in the array is assignable to QueueFilter', () => {
    // Compile-time half of the pairing. If the array and the type ever stop being
    // derived from one another, this stops type-checking.
    const values: QueueFilter[] = [...QUEUE_FILTERS];
    expect(values).toHaveLength(QUEUE_FILTERS.length);
  });
});

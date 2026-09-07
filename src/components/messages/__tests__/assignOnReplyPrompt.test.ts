/**
 * The ownership prompt rule (owner decision 2026-09-07). Every branch is one decision
 * a wrong turn would make visible: a prompt that never appears, or one that appears
 * on your own thread.
 */
import { describe, it, expect } from 'vitest';
import { decideAssignOnReplyPrompt, readAssignOnReplySetting } from '../assignOnReplyPrompt';

const me = 7;

describe('decideAssignOnReplyPrompt', () => {
  it('asks every time on a thread nobody owns', () => {
    expect(
      decideAssignOnReplyPrompt({ assigneeId: null, currentUserId: me, assignOnReply: true })
    ).toEqual({ kind: 'claim' });
    expect(
      decideAssignOnReplyPrompt({
        assigneeId: undefined,
        currentUserId: me,
        assignOnReply: undefined,
      })
    ).toEqual({ kind: 'claim' });
  });

  it("asks to take over a colleague's thread, naming them", () => {
    expect(
      decideAssignOnReplyPrompt({
        assigneeId: 9,
        assigneeName: 'Anna Ozola',
        currentUserId: me,
        assignOnReply: true,
      })
    ).toEqual({ kind: 'takeover', ownerName: 'Anna Ozola' });
    expect(
      decideAssignOnReplyPrompt({
        assigneeId: 9,
        assigneeName: '  ',
        currentUserId: me,
        assignOnReply: true,
      })
    ).toEqual({ kind: 'takeover', ownerName: 'a colleague' });
  });

  it('asks nothing when you already own the thread', () => {
    expect(
      decideAssignOnReplyPrompt({ assigneeId: me, currentUserId: me, assignOnReply: true })
    ).toBeNull();
  });

  it('asks nothing when the workspace turned assign-on-reply off, whoever owns it', () => {
    expect(
      decideAssignOnReplyPrompt({ assigneeId: null, currentUserId: me, assignOnReply: false })
    ).toBeNull();
    expect(
      decideAssignOnReplyPrompt({ assigneeId: 9, currentUserId: me, assignOnReply: false })
    ).toBeNull();
  });

  it('asks nothing when the current user is unknown (never assign to nobody)', () => {
    expect(
      decideAssignOnReplyPrompt({ assigneeId: null, currentUserId: null, assignOnReply: true })
    ).toBeNull();
  });
});

describe('readAssignOnReplySetting', () => {
  it('reads a boolean off the workspace settings and treats anything else as unset', () => {
    expect(readAssignOnReplySetting({ settings: { assignOnReply: false } })).toBe(false);
    expect(readAssignOnReplySetting({ settings: { assignOnReply: true } })).toBe(true);
    expect(readAssignOnReplySetting({ settings: {} })).toBeUndefined();
    expect(readAssignOnReplySetting({ settings: null })).toBeUndefined();
    expect(readAssignOnReplySetting(null)).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { usePresenceSummaryStore, NO_VIEWERS } from '../presenceSummaryStore';

const state = () => usePresenceSummaryStore.getState();

beforeEach(() => state().reset());

describe('presenceSummaryStore', () => {
  it('a snapshot fills the threads (string keys become numbers) and a change merges into it', () => {
    state().applySnapshot({
      '10': [{ userId: 7, state: 'viewing' }],
      '11': [{ userId: 8, state: 'away' }],
    });
    state().applyChanges([{ conversationId: 10, users: [{ userId: 7, state: 'writing_reply' }] }]);
    expect(state().byConversation[10]).toEqual([{ userId: 7, state: 'writing_reply' }]);
    expect(state().byConversation[11]).toEqual([{ userId: 8, state: 'away' }]);
  });

  it('a change with no users removes that conversation entry', () => {
    state().applySnapshot({ '10': [{ userId: 7, state: 'viewing' }] });
    state().applyChanges([{ conversationId: 10, users: [] }]);
    expect(10 in state().byConversation).toBe(false);
  });

  it('a snapshot replaces everything, including a summary that arrived before it', () => {
    state().applyChanges([{ conversationId: 5, users: [{ userId: 1, state: 'viewing' }] }]);
    expect(state().byConversation[5]).toHaveLength(1);
    state().applySnapshot({ '10': [{ userId: 7, state: 'viewing' }] });
    expect(Object.keys(state().byConversation)).toEqual(['10']);
  });

  it('keeps the same array for an entry that did not change, and a change on A leaves B alone', () => {
    state().applySnapshot({
      '10': [{ userId: 7, state: 'viewing' }],
      '11': [{ userId: 8, state: 'viewing' }],
    });
    const rowB = state().byConversation[11];
    const rowA = state().byConversation[10];
    state().applyChanges([{ conversationId: 10, users: [{ userId: 7, state: 'writing_reply' }] }]);
    expect(state().byConversation[11]).toBe(rowB);
    expect(state().byConversation[10]).not.toBe(rowA);
    state().applySnapshot({
      '10': [{ userId: 7, state: 'writing_reply' }],
      '11': [{ userId: 8, state: 'viewing' }],
    });
    expect(state().byConversation[11]).toBe(rowB);
  });

  it('available is set by setAvailable and cleared by reset', () => {
    expect(state().available).toBe(false);
    state().setAvailable(true);
    expect(state().available).toBe(true);
    state().applySnapshot({ '10': [{ userId: 7, state: 'viewing' }] });
    state().reset();
    expect(state().available).toBe(false);
    expect(state().byConversation).toEqual({});
  });

  it('exposes one shared empty list', () => {
    expect(NO_VIEWERS).toEqual([]);
  });
});

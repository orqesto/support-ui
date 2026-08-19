import { describe, it, expect } from 'vitest';
import { toSimilarMessages, type SuggestedAnswerSource } from '../similarMessagesTypes';

const src = (over: Partial<SuggestedAnswerSource>): SuggestedAnswerSource => ({
  type: 'message', id: 1, content: 'body', similarity: 0.9, ...over,
});

describe('toSimilarMessages', () => {
  // The regression this file exists for: support-service#367 added a 'knowledge_base'
  // source type. It previously fell through to the 'message' branch, which sets messageId
  // only for type === 'message' — so the entry arrived with NO id of any kind, rendering
  // untitled, unbadged and unlinkable.
  it('maps a mined KB entry like documentation, so it stays linkable', () => {
    const [row] = toSimilarMessages([
      src({ type: 'knowledge_base', id: 42, title: 'Refund policy', answer: 'Within 30 days.' }),
    ]);

    expect(row.source).toBe('documentation');
    expect(row.documentationId).toBe(42);
    expect(row.documentTitle).toBe('Refund policy');
    expect(row.directReply).toBe('Within 30 days.');
    // No parent document to deep-link into — these belong to uploaded-doc chunks only.
    expect(row.parentDocId).toBeUndefined();
    expect(row.chunkIndex).toBeUndefined();
  });

  it('flags a hit that came from the org-wide fallback', () => {
    const [row] = toSimilarMessages([
      src({ type: 'knowledge_base', id: 7, metadata: { viaOrgWideFallback: true } }),
    ]);
    expect(row.viaOrgWideFallback).toBe(true);
  });

  it('leaves a normal department hit unflagged', () => {
    const [row] = toSimilarMessages([src({ type: 'knowledge_base', id: 7 })]);
    expect(row.viaOrgWideFallback).toBe(false);
  });

  // CONTROL: uploaded-doc chunks must keep their deep-link fields.
  it('CONTROL: a documentation chunk keeps parentDocId and chunkIndex', () => {
    const [row] = toSimilarMessages([
      src({ type: 'documentation', id: 9, parentDocId: 3, chunkIndex: 2, title: 'Handbook' }),
    ]);
    expect(row.source).toBe('documentation');
    expect(row.parentDocId).toBe(3);
    expect(row.chunkIndex).toBe(2);
  });

  // CONTROL: a real message must still map to the message branch with its id.
  it('CONTROL: a message keeps messageId and does not become documentation', () => {
    const [row] = toSimilarMessages([
      src({ type: 'message', id: 55, metadata: { sender: 'a@b.c' } }),
    ]);
    expect(row.source).toBe('message');
    expect(row.messageId).toBe(55);
    expect(row.documentationId).toBeUndefined();
    expect(row.sender).toBe('a@b.c');
  });
});

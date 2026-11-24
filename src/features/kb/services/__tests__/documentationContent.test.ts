import { describe, it, expect } from 'vitest';
import { normalizeDocumentationChunks } from '../documentation.service';

describe('normalizeDocumentationChunks', () => {
  it('a non-array answer is no chunks', () => {
    expect(normalizeDocumentationChunks({ error: 'x' })).toEqual([]);
    expect(normalizeDocumentationChunks(null)).toEqual([]);
  });

  it('skips rows without text and orders by chunk index', () => {
    expect(
      normalizeDocumentationChunks([
        { content: 'second', chunkIndex: 1 },
        { content: null, chunkIndex: 2 },
        'junk',
        { content: 'first', chunkIndex: 0 },
      ])
    ).toEqual([
      { content: 'first', chunkIndex: 0 },
      { content: 'second', chunkIndex: 1 },
    ]);
  });
});

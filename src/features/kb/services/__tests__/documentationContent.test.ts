import { describe, it, expect } from 'vitest';
import {
  normalizeDocumentationChunks,
  normalizeDocumentationFormatted,
  sourcePathOf,
} from '../documentation.service';

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

describe('Confluence formatted page (FE/BE skew: read defensively)', () => {
  it('sourcePath: a list of titles, else null', () => {
    expect(sourcePathOf(['Space', 'Page'])).toEqual(['Space', 'Page']);
    expect(sourcePathOf(['Space', 3, '', null, 'Page'])).toEqual(['Space', 'Page']);
    expect(sourcePathOf([])).toBeNull();
    expect(sourcePathOf(undefined)).toBeNull();
    expect(sourcePathOf('Space › Page')).toBeNull();
  });

  it('contentMarkdown: a non-empty string, else null (older backend, blank, wrong type)', () => {
    expect(normalizeDocumentationFormatted({ contentMarkdown: '# T', sourcePath: ['S'] })).toEqual({
      contentMarkdown: '# T',
      sourcePath: ['S'],
    });
    expect(normalizeDocumentationFormatted({ id: 1 })).toEqual({ contentMarkdown: null, sourcePath: null });
    expect(normalizeDocumentationFormatted({ contentMarkdown: '  ' }).contentMarkdown).toBeNull();
    expect(normalizeDocumentationFormatted({ contentMarkdown: 5 }).contentMarkdown).toBeNull();
    expect(normalizeDocumentationFormatted(null)).toEqual({ contentMarkdown: null, sourcePath: null });
  });
});

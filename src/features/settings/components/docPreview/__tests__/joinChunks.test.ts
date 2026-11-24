import { describe, it, expect } from 'vitest';
import { joinChunks, seamRuleFor } from '../joinChunks';
import { BE_CONFIGS, BE_STRATEGIES, beChunk, inventedDocument } from './beChunker';

/**
 * The preview glued chunks with "\n\n", so every seam showed the chunker's overlap twice. These
 * tests cut an invented document with a copy of the backend chunker and join it back.
 */

const text = inventedDocument(30000);

describe('joinChunks — one document, no repeated text at the seams', () => {
  it.each(['technical', 'legal', 'policy', 'general', 'template'])(
    'type %s: joins back to the extracted text',
    (type) => {
      const chunks = beChunk(text, BE_CONFIGS[type]);
      expect(joinChunks(chunks, seamRuleFor(type, 'auto'))).toBe(text.trim());
    }
  );

  it('type nda (no overlap): no text lost or repeated; whitespace only where trimming took it', () => {
    // Where a window edge was trimmed, how much whitespace was there cannot be told, so the
    // seam gets one line break; full windows on both sides join with nothing between them.
    const chunks = beChunk(text, BE_CONFIGS.nda);
    expect(chunks.length).toBe(4);
    const joined = joinChunks(chunks, seamRuleFor('nda', 'auto'));
    const ink = (value: string) => value.replace(/\s+/g, '');
    expect(ink(joined)).toBe(ink(text));
    expect(joined.length).toBeLessThanOrEqual(text.trim().length + chunks.length - 1);
  });

  it.each(Object.keys(BE_STRATEGIES))('strategy %s: joins back to the extracted text', (strategy) => {
    const chunks = beChunk(text, BE_STRATEGIES[strategy]);
    expect(joinChunks(chunks, seamRuleFor('general', strategy))).toBe(text.trim());
  });

  it('a null strategy is the type default (rows written before strategies existed)', () => {
    const chunks = beChunk(text, BE_CONFIGS.policy);
    expect(joinChunks(chunks, seamRuleFor('policy', null))).toBe(text.trim());
  });

  it('control: the old "\\n\\n" join repeats each seam (what the tests above guard)', () => {
    const chunks = beChunk(text, BE_CONFIGS.general);
    expect(chunks.length).toBeGreaterThan(10);
    const old = chunks.join('\n\n');
    expect(old.length - text.trim().length).toBeGreaterThan(200 * (chunks.length - 1));
  });

  it('a seam whose overlap region starts and ends in whitespace still joins exactly', () => {
    // A window boundary lands inside runs of blank lines on both sides of the overlap.
    const padded = `${'a'.repeat(1240)}\n\n\n${'word '.repeat(40).trim()}\n\n\n${'tail text '.repeat(200)}`;
    const chunks = beChunk(padded, BE_CONFIGS.general);
    expect(joinChunks(chunks, seamRuleFor('general', 'auto'))).toBe(padded.trim());
  });

  it('no overlap and a mid-word cut between full windows: the word is not split', () => {
    const noSpaces = 'x'.repeat(7990) + 'carriers' + 'y'.repeat(7998) + 'z'.repeat(500);
    const chunks = beChunk(noSpaces, BE_CONFIGS.nda);
    expect(chunks.length).toBe(3);
    expect(joinChunks(chunks, seamRuleFor('nda', 'auto'))).toContain('carriers');
  });

  it('no match (a missing chunk): the next chunk starts on its own line, nothing dropped', () => {
    expect(joinChunks(['first part of text', 'unrelated next chunk'], seamRuleFor('general', 'auto'))).toBe(
      'first part of text\nunrelated next chunk'
    );
  });

  it('a short accidental match is not taken as an overlap', () => {
    expect(joinChunks(['ends with the', 'the start'], seamRuleFor('general', 'auto'))).toBe(
      'ends with the\nthe start'
    );
  });

  it('no chunks and one chunk', () => {
    expect(joinChunks([], seamRuleFor('general', 'auto'))).toBe('');
    expect(joinChunks(['only'], seamRuleFor('general', 'auto'))).toBe('only');
  });
});

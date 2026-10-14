import { describe, expect, it } from 'vitest';
import { noteFromEditor, noteText } from '../noteText';

/**
 * Internal notes are plain text. The composer's note mode is the rich-text editor, and its HTML
 * reached the thread as literal `<p>…</p>` (demo, 2026-10-14). See noteText.ts.
 */
describe('noteFromEditor — the editor HTML a note is posted from', () => {
  it('🔴 drops the tags, keeps paragraphs and list items as their own lines', () => {
    expect(noteFromEditor('<p>Customer moved to the new site.</p>')).toBe(
      'Customer moved to the new site.'
    );
    expect(noteFromEditor('<p>First.</p><p>Second &amp; last.</p>')).toBe(
      'First.\n\nSecond & last.'
    );
    expect(noteFromEditor('<ul><li><p>one</p></li><li><p>two</p></li></ul>')).toBe(
      '- one\n\n- two'
    );
  });
});

describe('noteText — a stored note, as the thread and the Notes tab print it', () => {
  it('🔴 a note stored as editor HTML (before the fix) reads as text', () => {
    expect(noteText('<p>Dispatch confirms the redirect.</p>')).toBe(
      'Dispatch confirms the redirect.'
    );
  });

  it('control: a plain note is untouched — even one that mentions a tag or a "<"', () => {
    expect(noteText('Called them back')).toBe('Called them back');
    expect(noteText('if total < 50 then <b> is fine')).toBe('if total < 50 then <b> is fine');
    expect(noteText('line one\nline two')).toBe('line one\nline two');
  });
});

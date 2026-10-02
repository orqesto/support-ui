import { describe, it, expect } from 'vitest';
import { isBlankRichText, PREVIEW_SOURCE_MAX, previewText, stripHtml } from '../stripHtml';

describe('stripHtml', () => {
  it('keeps a word boundary between block elements', () => {
    // The reported bug: an AI suggestion rendered as
    // "…your message.We can confirm…" because the tags vanished outright.
    expect(stripHtml('<p>Thank you for your message.</p><p>We can confirm.</p>')).toBe(
      'Thank you for your message. We can confirm.'
    );
  });

  it('does not introduce a space inside a word wrapped in inline markup', () => {
    expect(stripHtml('<p>Your <strong>subscription</strong> is cancelled.</p>')).toBe(
      'Your subscription is cancelled.'
    );
  });

  it('collapses <br> and source formatting to single spaces', () => {
    expect(stripHtml('<p>Kind regards,<br>Orbelli Team</p>')).toBe('Kind regards, Orbelli Team');
    expect(stripHtml('<p>a</p>\n\n   <p>b</p>')).toBe('a b');
  });

  it('decodes entities', () => {
    expect(stripHtml('<p>Tom&nbsp;&amp;&nbsp;Jerry</p>')).toBe('Tom & Jerry');
    expect(stripHtml('<p>&quot;quoted&quot; &#39;single&#39;</p>')).toBe('"quoted" \'single\'');
  });

  it('returns empty for falsy input', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('isBlankRichText', () => {
  // Guards the emptiness checks that gate sending — the separator change above
  // must not make markup-only bodies look non-empty.
  it('treats markup-only bodies as blank', () => {
    expect(isBlankRichText('<p></p>')).toBe(true);
    expect(isBlankRichText('<p><br></p>')).toBe(true);
    expect(isBlankRichText('<p>&nbsp;</p>')).toBe(true);
    expect(isBlankRichText('<img src="x.png">')).toBe(true);
    expect(isBlankRichText('')).toBe(true);
  });

  it('treats bodies with visible text as non-blank', () => {
    expect(isBlankRichText('<p>hi</p>')).toBe(false);
  });
});

describe('previewText', () => {
  it('strips only the first PREVIEW_SOURCE_MAX characters of a huge body', () => {
    const body = `<p>${'a'.repeat(PREVIEW_SOURCE_MAX)}</p><p>TAIL-MARKER</p>${'b'.repeat(250_000)}`;
    const preview = previewText(body);
    expect(preview).not.toContain('TAIL-MARKER');
    expect(preview.length).toBeLessThanOrEqual(PREVIEW_SOURCE_MAX);
  });

  it('a cut inside a tag or an entity leaves no fragment of it', () => {
    const inTag = `${'a'.repeat(PREVIEW_SOURCE_MAX - 10)}<td style="color: red">x</td>`;
    expect(previewText(inTag)).toBe('a'.repeat(PREVIEW_SOURCE_MAX - 10));
    const inEntity = `${'b'.repeat(PREVIEW_SOURCE_MAX - 3)}&nbsp;tail`;
    expect(previewText(inEntity)).toBe('b'.repeat(PREVIEW_SOURCE_MAX - 3));
  });

  it('a body that was NOT cut keeps a trailing ampersand or angle bracket that is just text', () => {
    expect(previewText('Call AT&T')).toBe(stripHtml('Call AT&T'));
    expect(previewText('Call AT&T')).toContain('AT&T');
    expect(previewText('R&D')).toContain('R&D');
    expect(previewText('love you <3')).toContain('<3');
    expect(previewText('3 < 5')).toContain('3 < 5');
  });

  it('a CUT body drops only a real tag or entity fragment at the cut', () => {
    const pad = (tail: string) =>
      'c'.repeat(PREVIEW_SOURCE_MAX - tail.length) + tail + 'REST-OF-BODY';
    const base = (tail: string) => 'c'.repeat(PREVIEW_SOURCE_MAX - tail.length);
    expect(previewText(pad('<td sty'))).toBe(base('<td sty'));
    expect(previewText(pad('</di'))).toBe(base('</di'));
    expect(previewText(pad('<!-- note'))).toBe(base('<!-- note'));
    expect(previewText(pad('&nbs'))).toBe(base('&nbs'));
    expect(previewText(pad('&#82'))).toBe(base('&#82'));
    expect(previewText(pad('&#x2F'))).toBe(base('&#x2F'));
    // Not a tag/entity shape: kept even at a cut.
    expect(previewText(pad(' <3'))).toContain('<3');
    expect(previewText(pad('3 < '))).toContain('3 <');
    expect(previewText(pad('R& '))).toContain('R&');
  });

  it('a short body previews whole, and null is empty', () => {
    expect(previewText('<p>Hello <b>there</b></p>')).toBe('Hello there');
    expect(previewText(null)).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { isBlankRichText, stripHtml } from '../stripHtml';

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

import { describe, it, expect } from 'vitest';
import { splitAtQuote } from '../messageDetailConstants';

/**
 * COR-SUP-2108 (taco, coresarms): the customer's iPhone reply rendered as one wall of
 * text — his two sentences followed by our entire previous reply and, inside it, his own
 * first email. The bubble showed no "show quoted" control at all.
 *
 * The stored body is what the ingestion tag-stripper produced from an HTML-only mail:
 * every tag became a space and `\s+` was collapsed to ' ', so the body is ONE line and
 * `<`/`>` survive as `&lt;`/`&gt;`. Every plain-text marker `splitAtQuote` looked for is
 * anchored to a newline, so none of them could ever match.
 */
const ONE_LINE_IPHONE_REPLY =
  'Yes please, that would be much appreciated. Thanks, Ricky. Sent from my iPhone ' +
  'On 1 Sep 2026, at 13:12, Info Coresarms &lt;info@coresarms.info&gt; wrote: Hello, ' +
  'Thank you for your patience, and we sincerely apologize for the inconvenience. ' +
  'Unfortunately, it looks like your parcel has been returned to us during the delivery ' +
  'process . Kind regards, Mia — On Sat, Aug 1, 2026, 3:43 PM, Ricky Thomas &lt; ' +
  'ricky.thomas42@yahoo.co.uk &gt; wrote: Hi, I placed an order on the 21st of July.';

describe('splitAtQuote — plain text', () => {
  it('collapses the reply history of a body whose line breaks did not survive ingestion', () => {
    const { main, quote } = splitAtQuote(ONE_LINE_IPHONE_REPLY, false);
    expect(main).toBe(
      'Yes please, that would be much appreciated. Thanks, Ricky. Sent from my iPhone'
    );
    expect(quote).toContain('On 1 Sep 2026, at 13:12');
    // Everything after the FIRST attribution is quoted — including the second,
    // deeper attribution nested inside our own reply.
    expect(quote).toContain('Ricky Thomas');
    expect(main).not.toContain('Kind regards');
  });

  it('splits the first attribution, not the deepest', () => {
    const { main } = splitAtQuote(ONE_LINE_IPHONE_REPLY, false);
    expect(main.length).toBeLessThan(100);
  });

  it('still splits a well-formed multi-line body at the newline-anchored marker', () => {
    const body =
      'Thanks, that works for me — please go ahead and send the replacement.\n\nOn Sat, 1 Aug 2026 at 18:43, Ricky Thomas wrote:\n> the original question';
    const { main, quote } = splitAtQuote(body, false);
    expect(main).toBe('Thanks, that works for me — please go ahead and send the replacement.');
    expect(quote).toContain('On Sat, 1 Aug 2026');
  });

  it('leaves a single-line body alone when the only "wrote:" is prose, not an attribution', () => {
    const body =
      'I checked the terms and conditions page again and the returns section says what you wrote: refunds within 30 days of delivery.';
    expect(splitAtQuote(body, false).quote).toBeNull();
  });

  it('does not empty the bubble when the quote starts at the very top', () => {
    const body =
      'On 1 Sep 2026, at 13:12, Info Coresarms wrote: Hello, thank you for your patience.';
    const { main, quote } = splitAtQuote(body, false);
    expect(main).toBe(body);
    expect(quote).toBeNull();
  });

  it('collapses an inline Outlook header in a body that lost its line breaks', () => {
    const body =
      'Yes please go ahead with the reshipment, thank you. From: info@coresarms.info Sent: 01 September 2026 13:12 To: ricky.thomas42@yahoo.co.uk Subject: RE: My order';
    const { main, quote } = splitAtQuote(body, false);
    expect(main).toBe('Yes please go ahead with the reshipment, thank you.');
    expect(quote).toContain('From: info@coresarms.info');
  });
});

/**
 * COR-SUP-251 (taco, coresarms): an 11-message thread where every reply re-rendered the
 * whole conversation. Visible text per message grew 675 → 5,122 characters; by the end an
 * agent scrolled through the entire history to find two new sentences.
 *
 * The collapser was firing — at the wrong place. It looped its HTML patterns and returned
 * on the first PATTERN that matched rather than the earliest POSITION in the document.
 * `<hr>` is tested first, and in this mail the only two `<hr>`s belong to the shop's footer
 * template ~20 KB down, while the real marker — a `gmail_quote` div — sits in the first
 * 2 KB. Measured on message 27307: blockquote at 430, gmail_quote at 1,268, `<hr>` at
 * 20,369. So `main` kept everything up to 20,369 (the whole quoted chain) and only the
 * footer collapsed.
 *
 * ⚠️ Before this, the HTML branch had NO test at all — every existing case above passes
 * `isHtml: false`. That is how an ordering bug this visible survived.
 */
const FOOTER_HR_AFTER_QUOTE =
  // Long enough to clear the 80-character floor the code applies to structural markers —
  // in the real mail the gmail_quote div sat at 1,268, far past it.
  '<div>Thanks for the update, that works for me and I appreciate you chasing the courier.</div>' +
  '<div class="gmail_quote"><div>On Tue, 12 Aug 2026 at 10:53, Info Coresarms wrote:</div>' +
  '<div>Hello Mark, your parcel is with the courier.</div>' +
  '<div>Hello Mark, an earlier reply quoted again and again.</div></div>' +
  '<div>CORE SARMS UK</div><hr><div>Unsubscribe | View in browser</div>';

describe('splitAtQuote — HTML', () => {
  it('splits at the EARLIEST marker, not at whichever pattern is listed first', () => {
    const { main, quote } = splitAtQuote(FOOTER_HR_AFTER_QUOTE, true);
    // The gmail_quote div, not the footer <hr> thousands of characters later.
    expect(main).toBe(
      '<div>Thanks for the update, that works for me and I appreciate you chasing the courier.</div>'
    );
    expect(quote).toContain('gmail_quote');
    // The whole quoted chain must be INSIDE the collapsed half, not left on screen.
    expect(main).not.toContain('your parcel is with the courier');
    expect(main).not.toContain('quoted again and again');
  });

  it('still splits at an <hr> when that is the earliest marker', () => {
    const body =
      '<div>Short reply that stands on its own and says enough to clear the 80-char floor.</div>' +
      '<hr><div>On Tue, 12 Aug 2026, Info Coresarms wrote: earlier text</div>';
    const { main, quote } = splitAtQuote(body, true);
    expect(main).toContain('Short reply that stands on its own');
    expect(quote).toContain('<hr>');
  });

  it('falls back to a blockquote when it is the only marker', () => {
    // A blockquote needs 150 characters of real message ahead of it, not 80: a short mail
    // can legitimately open by quoting a line before it says anything.
    const body =
      '<div>Yes please go ahead with the reshipment, that suits me and I appreciate the quick ' +
      'turnaround here. Let me know if you need the order number again.</div>' +
      '<blockquote><div>Earlier message being quoted back.</div></blockquote>';
    const { main, quote } = splitAtQuote(body, true);
    expect(main).toContain('Yes please go ahead');
    expect(quote).toContain('<blockquote>');
  });

  it('leaves a message with no quote marker whole', () => {
    const body = '<div>Just a short note with no quoted history at all in it whatsoever.</div>';
    const { main, quote } = splitAtQuote(body, true);
    expect(main).toBe(body);
    expect(quote).toBeNull();
  });

  it('ignores a marker inside the opening markup rather than emptying the bubble', () => {
    // A template that opens with an <hr> is decoration, not a divider — the 80-char floor
    // exists so the bubble never collapses to nothing.
    const body = '<hr><div>The entire message is this one line of new text.</div>';
    const { main, quote } = splitAtQuote(body, true);
    expect(main).toBe(body);
    expect(quote).toBeNull();
  });
});

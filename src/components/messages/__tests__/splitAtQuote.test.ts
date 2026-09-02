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

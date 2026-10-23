import { describe, expect, it } from 'vitest';
import { highlightTermsFor, splitByTerms } from '../highlightTerms';

const marked = (text: string, terms: string[]) =>
  splitByTerms(text, terms)
    .filter((part) => part.match)
    .map((part) => part.text);

describe('splitByTerms', () => {
  it('marks every term, any case, and keeps the rest of the text as it was', () => {
    const parts = splitByTerms('Invoice for John Smith', ['smith', 'INVOICE']);
    expect(parts.map((part) => part.text).join('')).toBe('Invoice for John Smith');
    expect(marked('Invoice for John Smith', ['smith', 'INVOICE'])).toEqual(['Invoice', 'Smith']);
  });

  it('matches a word of letters where a word STARTS, as the backend searched it', () => {
    expect(marked('Thank you for your layout', ['you'])).toEqual(['you', 'you']);
    expect(marked('the invoices', ['invo'])).toEqual(['invo']);
  });

  it('in a sender or subject, marks a term anywhere — the backend matches those anywhere', () => {
    const anywhere = (text: string, terms: string[]) =>
      splitByTerms(text, terms, 'anywhere')
        .filter((part) => part.match)
        .map((part) => part.text);
    expect(anywhere('bayou.tours@shop.example', ['you'])).toEqual(['you']);
    // CONTROL: in message text the same term marks only a word start.
    expect(marked('bayou tours', ['you'])).toEqual([]);
  });

  it('marks each word start at its own offset (separator not included)', () => {
    const parts = splitByTerms('Say thank you, you!', ['you']);
    expect(parts.filter((part) => part.match).map((part) => part.start)).toEqual([10, 15]);
    expect(parts.map((part) => part.text).join('')).toBe('Say thank you, you!');
  });

  it('marks a short word only as a whole word, in every field — as the backend matches it', () => {
    expect(marked('Hi Jose y Natalie, on Friday', ['y'])).toEqual(['y']);
    expect(marked('the bqz code', ['qz'])).toEqual([]);
    const anywhere = splitByTerms('hi.jose@y.test via yahoo', ['y', 'hi'], 'anywhere')
      .filter((part) => part.match)
      .map((part) => part.text);
    expect(anywhere).toEqual(['hi', 'y']);
    // CONTROL: a short CODE with a digit is still marked anywhere.
    expect(marked('ORD-4217', ['42'])).toEqual(['42']);
  });

  it('marks the whole typed text as one passage where it appears exactly', () => {
    const terms = highlightTermsFor({ terms: ['Hi', 'Jose', 'y', 'Natalie'], asPhrase: false });
    expect(terms).toContain('Hi Jose y Natalie');
    expect(marked('Hi Jose y Natalie ¿Puedo', terms)).toEqual(['Hi Jose y Natalie']);
    // Elsewhere the single words still mark.
    expect(marked('Hello Natalie', terms)).toEqual(['Natalie']);
    // One word, or input already read as a phrase: nothing added.
    expect(highlightTermsFor({ terms: ['invoice'], asPhrase: false })).toEqual(['invoice']);
    expect(highlightTermsFor(null)).toEqual([]);
  });

  it('marks the whole typed text as one passage even where its first word would match alone', () => {
    const anywhere = (text: string, terms: string[]) =>
      splitByTerms(text, terms, 'anywhere')
        .filter((part) => part.match)
        .map((part) => part.text);
    const reInvoice = highlightTermsFor({ terms: ['re', 'invoice'], asPhrase: false });
    expect(anywhere('Fwd: re invoice', reInvoice)).toEqual(['re invoice']);
    expect(
      marked('hi there, hi', highlightTermsFor({ terms: ['hi', 'there'], asPhrase: false }))
    ).toEqual(['hi there', 'hi']);
    const order = highlightTermsFor({ terms: ['order', '123'], asPhrase: false });
    expect(marked('order 123 shipped', order)).toEqual(['order 123']);
    expect(anywhere('Re: order 123', order)).toEqual(['order 123']);
    // In message text a phrase still starts at a word start, like its words.
    expect(marked('reorder 123', order)).toEqual(['123']);
  });

  it('marks a short Chinese or Japanese term inside a sentence, as the backend matches it', () => {
    expect(marked('注文書を送ってください', ['注文'])).toEqual(['注文']);
  });

  it('matches a code or an address anywhere, digits and symbols included', () => {
    expect(marked('Order ORD-44178 shipped', ['4417'])).toEqual(['4417']);
    expect(marked('from anna@shop.example', ['shop.example'])).toEqual(['shop.example']);
  });

  it('prefers the longer term where two fit, and a phrase across any spacing', () => {
    expect(marked('john smith wrote', ['john', 'john smith'])).toEqual(['john smith']);
    expect(marked('john  smith', ['john smith'])).toEqual(['john  smith']);
  });

  it('treats regex characters in a term as text', () => {
    expect(marked('price (net) is $5.00', ['(net)', '$5.00'])).toEqual(['(net)', '$5.00']);
  });

  it('returns the text unmarked with no terms, and nothing for no text', () => {
    expect(splitByTerms('plain', [])).toEqual([{ text: 'plain', match: false, start: 0 }]);
    expect(splitByTerms('plain', undefined)).toEqual([{ text: 'plain', match: false, start: 0 }]);
    expect(splitByTerms('', ['x'])).toEqual([]);
  });
});

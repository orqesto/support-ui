import { describe, expect, it } from 'vitest';
import { splitByTerms } from '../highlightTerms';

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

  it('matches a term under three letters anywhere — the backend does too', () => {
    expect(marked('the bqz code', ['qz'])).toEqual(['qz']);
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

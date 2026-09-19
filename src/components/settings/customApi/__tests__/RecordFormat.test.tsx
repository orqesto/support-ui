/**
 * CA-5 Task 6 — D36, the pre-fill format derived from an EXAMPLE.
 *
 * ⚠️ `findInText` is a SECOND implementation of the backend's `extractCandidates`, for the
 * preview only. The scan cases below mirror the backend's semantics deliberately — whole-token
 * boundaries, prefix compared not compiled — so a divergence shows up here rather than as a
 * preview that quietly lies.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordFormatStep } from '../RecordFormatStep';
import { deriveFormat, describeFormat, exampleFor, findInText } from '../recordFormat';

describe('deriving a format from what an admin types', () => {
  it.each([
    ['137416', { prefix: '', length: 6, charset: 'digits' }],
    ['ORD-137416', { prefix: 'ORD-', length: 6, charset: 'digits' }],
    ['#A1B2C3', { prefix: '#', length: 6, charset: 'alnum_upper' }],
    ['inv/2026ab', { prefix: 'inv/', length: 6, charset: 'alnum' }],
  ])('%s → the three values, never a pattern', (example, expected) => {
    expect(deriveFormat(example)).toEqual(expected);
  });

  it('⛔ says so honestly when it cannot read the example', () => {
    // RED: return a format anyway and the admin saves something that matches nothing, for ever.
    expect(deriveFormat('   ')).toBeNull();
    expect(deriveFormat('ORD-')).toBeNull();
  });

  it("describes the format in the CLIENT's words", () => {
    expect(describeFormat({ prefix: '', length: 6, charset: 'digits' })).toBe(
      '6 digits, with no prefix'
    );
    expect(describeFormat({ prefix: 'ORD-', length: 6, charset: 'digits' })).toMatch(
      /6 digits, starting with “ORD-”/
    );
    // ⛔ RED: say "prefix ORD-, length 6, charset digits" and we have exported our data model.
    expect(describeFormat({ prefix: '', length: 1, charset: 'digits' })).toContain('1 digit,');
  });
});

describe('⛔ re-opening a saved lookup must not narrow its format (audit pass 1)', () => {
  it.each([
    [{ prefix: '', length: 6, charset: 'digits' as const }],
    [{ prefix: '', length: 6, charset: 'alnum_upper' as const }],
    [{ prefix: '', length: 6, charset: 'alnum' as const }],
    [{ prefix: 'ORD-', length: 4, charset: 'alnum_upper' as const }],
    [{ prefix: '#', length: 1, charset: 'alnum' as const }],
  ])('%o survives a round trip through the example field', (format) => {
    /*
     * ⛔ RED: rebuild the example as `prefix + '0'.repeat(length)` — which is what it did — and a
     * lookup saved as `alnum` shows "000000", derives back to `digits`, and is SILENTLY NARROWED
     * the next time an admin opens it and presses Save without touching this field. They would
     * have no way to know: the screen showed them a number, and a number is what they saved.
     */
    expect(deriveFormat(exampleFor(format))).toEqual(format);
  });
});

describe('the scan — mirrored from the backend, boundaries and all', () => {
  const digits6 = { prefix: '', length: 6, charset: 'digits' } as const;

  it('finds a whole token in a real sentence', () => {
    expect(findInText('Hi, where is my order 137416? Thanks', digits6)).toEqual(['137416']);
  });

  it('⛔ does not match a SLICE of a longer run', () => {
    // RED: drop the boundary rule and `1374169` yields `137416`, pre-filling a number the
    // customer never wrote.
    expect(findInText('order 1374169 please', digits6)).toEqual([]);
  });

  it('matches a prefixed reference literally, never as a pattern', () => {
    const ord = { prefix: 'ORD-', length: 6, charset: 'digits' } as const;
    expect(findInText('see ORD-137416 and ORD-999999', ord)).toEqual(['ORD-137416', 'ORD-999999']);
    // The prefix is compared with startsWith: a `.` in it is a full stop, not "any character".
    const dotted = { prefix: 'A.', length: 2, charset: 'digits' } as const;
    expect(findInText('AX12 A.12', dotted)).toEqual(['A.12']);
  });

  it('returns [] rather than throwing when nothing matches', () => {
    expect(findInText('no numbers here', digits6)).toEqual([]);
    expect(findInText('', digits6)).toEqual([]);
  });

  it('de-duplicates and caps what it returns', () => {
    const text = Array.from(
      { length: 12 },
      (_, index) => `1374${String(index).padStart(2, '0')}`
    ).join(' ');
    expect(findInText(text, digits6).length).toBeLessThanOrEqual(5);
    expect(findInText('137416 137416', digits6)).toEqual(['137416']);
  });
});

describe('the step an admin sees', () => {
  it('⛔ HAS NO REGEX OR PATTERN INPUT ANYWHERE (D36)', async () => {
    const user = userEvent.setup();
    render(<RecordFormatStep value={null} onChange={() => {}} />);
    await user.type(screen.getByLabelText(/An example of one of your order numbers/i), '137416');

    /*
     * ⛔ RED: add a "pattern" field and an admin-authored regex reaches inbound message text —
     * an unbounded ReDoS surface on the one path that must never stall. This is the bound D36
     * set on ITSELF when it reversed D14, so it is asserted rather than trusted.
     */
    const labels = screen.getAllByText(/./).map((node) => node.textContent?.toLowerCase() ?? '');
    for (const forbidden of ['regex', 'regular expression', 'pattern']) {
      expect(labels.some((text) => text.includes(forbidden))).toBe(false);
    }
  });

  it('says back what it understood, and shows it working before anything is saved', async () => {
    const user = userEvent.setup();
    render(<RecordFormatStep value={null} onChange={() => {}} />);
    await user.type(screen.getByLabelText(/An example of one of your order numbers/i), '137416');

    expect(screen.getByText(/6 digits, with no prefix/i)).toBeTruthy();
    // ⛔ RED: save blind and a wrong format silently pre-fills nothing, for ever.
    expect(screen.getByText(/we would suggest/i)).toBeTruthy();
    expect(screen.getByText('137416', { selector: 'strong' })).toBeTruthy();
  });

  it('⛔ says plainly when the format would find nothing in the sample', async () => {
    const user = userEvent.setup();
    render(<RecordFormatStep value={null} onChange={() => {}} />);
    await user.type(screen.getByLabelText(/An example of one of your order numbers/i), 'AB-99');

    // The default sentence contains 137416, which this format does not describe.
    expect(screen.getByText(/would not find anything in that message/i)).toBeTruthy();
  });

  it('reports null when cleared — "do not pre-fill" is a real choice', async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    render(<RecordFormatStep value={null} onChange={(next) => changes.push(next)} />);
    const field = screen.getByLabelText(/An example of one of your order numbers/i);
    await user.type(field, '137416');
    await user.clear(field);
    expect(changes.at(-1)).toBeNull();
  });
});

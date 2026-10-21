import { describe, it, expect } from 'vitest';
import {
  failureSentence,
  GENERIC_FAILURE,
  notFoundText,
  lookupListLine,
  noMatchHintText,
  pressPrompt,
  referenceNameOf,
  skippedText,
} from '../customApiLookupText';
import type { CustomApiLookupResult } from '@/services/customApiLookup.service';

const result = (over: Partial<CustomApiLookupResult>): CustomApiLookupResult =>
  ({
    endpointId: 1,
    label: 'User details',
    connectionName: 'Acme',
    resultShape: 'one',
    status: 'no_match',
    ...over,
  }) as CustomApiLookupResult;

describe('failureSentence', () => {
  it('names the connection for its class', () => {
    expect(failureSentence('auth', 'Acme')).toBe('Acme refused our access.');
    expect(failureSentence('unreachable', 'Acme')).toBe('We could not reach Acme.');
    expect(failureSentence('timeout', 'Acme')).toBe('Acme took too long to answer.');
    expect(failureSentence('vendor_error', 'Acme')).toBe('Acme had a problem answering.');
    expect(failureSentence('bad_config', 'Acme')).toBe('This lookup is not set up correctly.');
    expect(failureSentence('rate_limited', 'Acme')).toMatch(/Too many lookups/);
  });
  it('a nameless connection still reads as a sentence', () => {
    expect(failureSentence('auth', '')).toBe('This system refused our access.');
  });
  it('an unknown or absent class (older backend) is the generic sentence, never raw text', () => {
    expect(failureSentence(undefined, 'Acme')).toBe(GENERIC_FAILURE);
    expect(failureSentence('a_class_from_the_future', 'Acme')).toBe(GENERIC_FAILURE);
    // Prototype keys are not classes.
    expect(failureSentence('toString', 'Acme')).toBe(GENERIC_FAILURE);
  });
});

describe('notFoundText', () => {
  it('a typed value names the value with the reference name', () => {
    expect(
      notFoundText(
        result({ referenceLabel: 'User id', searchedFor: { kind: 'reference', value: '999999' } })
      )
    ).toBe('No User id 999999 in Acme.');
  });
  it('no reference name → "Reference"', () => {
    expect(notFoundText(result({ searchedFor: { kind: 'reference', value: '7' } }))).toBe(
      'No Reference 7 in Acme.'
    );
  });
  it('an email search names the email', () => {
    expect(
      notFoundText(result({ searchedFor: { kind: 'email', value: 'nobody@example.com' } }))
    ).toBe('Nothing in Acme for nobody@example.com.');
  });
  it('a chained search names the SOURCE label', () => {
    expect(
      notFoundText(result({ searchedFor: { kind: 'source', label: 'Customer account' } }))
    ).toBe('Nothing in Acme for what “Customer account” returned.');
  });
  it('an older backend: the typed value if we know it, else today’s wording', () => {
    expect(notFoundText(result({}), '42')).toBe('No Reference 42 in Acme.');
    expect(notFoundText(result({}))).toBe('No matching records for this customer.');
  });
});

describe('skippedText', () => {
  it('names the source lookup', () => {
    expect(skippedText({ reason: 'source_no_match', sourceLabel: 'Customer account' })).toBe(
      'Skipped — Customer account found nothing.'
    );
    expect(skippedText({ reason: 'source_failed', sourceLabel: 'Customer account' })).toBe(
      'Skipped — Customer account could not be completed.'
    );
    expect(skippedText({ reason: 'source_no_identity', sourceLabel: 'Customer account' })).toBe(
      'Skipped — Customer account needs the customer’s email, and there is none.'
    );
  });
});

describe('referenceNameOf / pressPrompt', () => {
  it('falls back to Reference', () => {
    expect(referenceNameOf(null)).toBe('Reference');
    expect(referenceNameOf('  ')).toBe('Reference');
    expect(referenceNameOf('Ticket id')).toBe('Ticket id');
  });
  it('lists the systems a press will ask', () => {
    expect(pressPrompt(['Acme'])).toBe('Check Acme for this customer.');
    expect(pressPrompt(['Acme', 'Militech'])).toBe('Check Acme and Militech for this customer.');
    expect(pressPrompt(['Acme', 'Militech', 'Globex'])).toBe(
      'Check Acme, Militech and Globex for this customer.'
    );
    // 2026-10-15: the address a press looks up is named; a blank one falls back.
    expect(pressPrompt(['Acme'], 'buyer@example.com')).toBe('Check Acme for buyer@example.com.');
    expect(pressPrompt(['Acme'], '  ')).toBe('Check Acme for this customer.');
    expect(pressPrompt([])).toBe('Check the connected systems for this customer.');
  });
});

describe('lookupListLine — which lookups a press runs (2026-10-15)', () => {
  it('names up to three and counts the rest', () => {
    expect(lookupListLine(['Account'])).toBe('1 lookup: Account');
    expect(lookupListLine(['Account', 'Orders', 'Invoices'])).toBe(
      '3 lookups: Account · Orders · Invoices'
    );
    expect(lookupListLine(['A1', 'B2', 'C3', 'D4', 'E5'])).toBe('5 lookups: A1 · B2 · C3 · +2');
  });

  it('says nothing when no lookup is known, and skips blank labels', () => {
    expect(lookupListLine([])).toBe('');
    expect(lookupListLine(['', '  '])).toBe('');
    expect(lookupListLine(['Account', ' '])).toBe('1 lookup: Account');
  });
});

describe('noMatchHintText — the admin’s words, only when the lookup found nothing', () => {
  const hint = 'Ask the customer for their reference.';

  it('a no-match shows the hint, trimmed', () => {
    expect(noMatchHintText(result({ status: 'no_match', noMatchHint: `  ${hint} ` }))).toBe(hint);
  });

  it('a chain skipped because its source found nothing shows it', () => {
    const skipped = result({
      status: 'no_match',
      noMatchHint: hint,
      skippedBecause: { reason: 'source_no_match', sourceLabel: 'Account' },
    });
    expect(noMatchHintText(skipped)).toBe(hint);
  });

  it('CONTROL: a chain skipped because its source FAILED does not', () => {
    for (const status of ['no_match', 'failed'] as const) {
      const skipped = result({
        status,
        noMatchHint: hint,
        skippedBecause: { reason: 'source_failed', sourceLabel: 'Account' },
      });
      expect(noMatchHintText(skipped)).toBeNull();
    }
  });

  it('CONTROL: a chain skipped for a missing email does not', () => {
    const skipped = result({
      status: 'no_identity',
      noMatchHint: hint,
      skippedBecause: { reason: 'source_no_identity', sourceLabel: 'Account' },
    });
    expect(noMatchHintText(skipped)).toBeNull();
  });

  it('CONTROL: failed, no-identity, needs-input and ok do not', () => {
    for (const status of ['failed', 'no_identity', 'needs_input', 'ok', 'shape_changed'] as const) {
      expect(noMatchHintText(result({ status, noMatchHint: hint }))).toBeNull();
    }
  });

  it('CONTROL: an older backend (no field), null and blank show nothing', () => {
    expect(noMatchHintText(result({ status: 'no_match' }))).toBeNull();
    expect(noMatchHintText(result({ status: 'no_match', noMatchHint: null }))).toBeNull();
    expect(noMatchHintText(result({ status: 'no_match', noMatchHint: '  \n ' }))).toBeNull();
  });
});

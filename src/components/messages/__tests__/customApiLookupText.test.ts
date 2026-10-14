import { describe, it, expect } from 'vitest';
import {
  failureSentence,
  GENERIC_FAILURE,
  notFoundText,
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
    expect(pressPrompt(['Acme'])).toBe('Press Look up to check Acme for this customer.');
    expect(pressPrompt(['Acme', 'Militech'])).toBe(
      'Press Look up to check Acme and Militech for this customer.'
    );
    expect(pressPrompt(['Acme', 'Militech', 'Globex'])).toBe(
      'Press Look up to check Acme, Militech and Globex for this customer.'
    );
    expect(pressPrompt([])).toBe(
      'Press Look up to check the connected systems for this customer.'
    );
  });
});

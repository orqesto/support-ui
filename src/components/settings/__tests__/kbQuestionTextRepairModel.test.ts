import { describe, expect, it } from 'vitest';

import { reasonText } from '../kbQuestionTextRepairModel';

describe('reasonText', () => {
  it('says why an entry is left for a person, in words', () => {
    expect(reasonText('forwarded')).toBe('a forwarded mail');
    expect(reasonText('unmarked_quote')).toBe('quote without ">" marks');
    expect(reasonText('attribution_no_address')).toBe('"… wrote:" line without an address');
    expect(reasonText('form_chrome')).toBe('form plugin details in the text');
  });

  it('a code it does not know is shown readable, not dropped', () => {
    expect(reasonText('some_new_reason')).toBe('some new reason');
  });
});

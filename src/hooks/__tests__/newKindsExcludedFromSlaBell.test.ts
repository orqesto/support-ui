/**
 * The SLA bell's kind filter is fail-OPEN by design: an unknown kind still shows, so a real
 * breach can never be hidden by a denylist. The cost of that choice is that any kind WITHOUT
 * its own surface renders in the bell as an amber "breach" with no breach fields — a row that
 * tells the reader nothing and looks like a bug. `NON_SLA_BELL_KINDS` is what pays it.
 *
 * These two kinds own their surface in useUnansweredOutboundAlerts, so they must be listed.
 * Asserted against the SOURCE rather than by rendering the bell: the failure is an omission
 * from a set, and a rendering test would only catch it via the amber row it produces.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../useSLANotifications.ts'),
  'utf8',
);
const nonSlaBlock = source.slice(
  source.indexOf('NON_SLA_BELL_KINDS = new Set(['),
  source.indexOf(']);', source.indexOf('NON_SLA_BELL_KINDS = new Set([')),
);

describe('NON_SLA_BELL_KINDS', () => {
  it('excludes one_sided_outbound, which has its own surface', () => {
    expect(nonSlaBlock).toContain('one_sided_outbound');
  });

  it('excludes customer_reply_in_spam, which has its own surface', () => {
    expect(nonSlaBlock).toContain('customer_reply_in_spam');
  });

  it('still excludes the kinds that were already there', () => {
    // Control: proves the slice actually captured the set and is not just a big string.
    expect(nonSlaBlock).toContain('kb_document_stale');
    expect(nonSlaBlock).toContain('spam_arrival');
    // And that it is the SET, not the whole file — a real SLA kind must not appear here.
    expect(nonSlaBlock).not.toContain('sla_message_breach');
  });
});

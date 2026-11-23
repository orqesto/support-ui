/**
 * A thread an automatic reply resolved kept its "Needs info" risk signal in the list: the flag is
 * the AI analysis of the customer's message and nothing cleared it. A finished thread asks nobody
 * for anything, so the signal is for threads still in work.
 */
import { describe, expect, it } from 'vitest';
import { getRiskSignals } from '../inboxCardHelpers';
import type { Message } from '@/types';

const thread = (status: string): Message =>
  ({
    id: 1,
    status,
    metadata: { analysis: { needsMoreInfo: true } },
  }) as unknown as Message;
const keys = (status: string) => getRiskSignals(thread(status)).map((signal) => signal.key);

describe('"Needs info" on the thread card', () => {
  it.each(['resolved', 'closed'])('a %s thread does not show it', (status) => {
    expect(keys(status)).not.toContain('needs-info');
  });

  it.each(['open', 'in_progress', 'pending', 'on_hold'])(
    'CONTROL: a thread that is %s shows it',
    (status) => {
      expect(keys(status)).toContain('needs-info');
    }
  );
});

/**
 * The help line above a KB entry list explains only the buttons that list shows (2026-10-13).
 *
 * Under a list of approved answers it used to explain Approve, Reject and "Pending answers are never
 * used" — no such button was on screen — and a moderator read it as a decision waiting to be made.
 */
import { describe, it, expect } from 'vitest';
import { actionsHelp } from '@/components/kb/kbWorkRowModel';
import type { KbWorkRowStatus } from '@/services/kbConsolidation.service';

const only = (...statuses: KbWorkRowStatus[]) => new Set<KbWorkRowStatus>(statuses);

describe('the KB actions help line', () => {
  it('⛔ names no Approve or Reject under a list of approved answers', () => {
    // RED before: the line ignored what was listed and always explained Approve and Reject.
    const line = actionsHelp(false, only('approved'));

    expect(line).not.toMatch(/Approve:|Reject:|Pending answers/);
    expect(line).toMatch(/Hide: out of use until Unhide/);
    expect(line).toMatch(/Edit: change the text/);
  });

  it('explains Approve, Reject and pending where a pending answer is listed (control)', () => {
    // Without this, a line that dropped Approve everywhere would pass the case above.
    const line = actionsHelp(false, only('approved', 'pending'));

    expect(line).toMatch(/Approve: it may use the answer/);
    expect(line).toMatch(/Reject: never used/);
    expect(line).toMatch(/Pending answers are never used/);
  });

  it('a list of only hidden answers explains Unhide, not Hide', () => {
    const line = actionsHelp(false, only('hidden'));

    expect(line).toMatch(/Unhide: back in use/);
    expect(line).not.toMatch(/Hide: out of use/);
    expect(line).not.toMatch(/Approve:/);
  });

  it('keeps the full line when the caller does not say what is listed', () => {
    expect(actionsHelp(true)).toMatch(/Approve:.*Reject:.*Hide:.*Edit:.*Move into case:.*Pending/);
  });
});

/**
 * The help line above a KB cases list explains only what the list offers (2026-10-13), and since
 * 2026-10-21 deciding is done in the Knowledge Base list, not here.
 *
 * Under a list of approved answers it used to explain Approve, Reject and "Pending answers are never
 * used" — no such button was on screen — and a moderator read it as a decision waiting to be made.
 */
import { describe, it, expect } from 'vitest';
import { actionsHelp } from '@/components/kb/kbWorkRowModel';
import type { KbWorkRowStatus } from '@/services/kbConsolidation.service';

const only = (...statuses: KbWorkRowStatus[]) => new Set<KbWorkRowStatus>(statuses);

describe('the KB actions help line', () => {
  it('⛔ explains no decision button under a list of approved answers, and points to the list', () => {
    const line = actionsHelp(false, only('approved'));

    expect(line).not.toMatch(/Approve:|Reject:|Hide:|Unhide:|Pending answers/);
    expect(line).toMatch(/Edit: change the text/);
    expect(line).toMatch(/in the Knowledge Base list/);
  });

  it('still says pending answers are never used where one is listed (control)', () => {
    expect(actionsHelp(false, only('approved', 'pending'))).toMatch(
      /Pending answers are never used/
    );
    expect(actionsHelp(false, only('hidden'))).not.toMatch(/Unhide:|Hide:/);
  });

  it('explains Move into case only where it is offered', () => {
    expect(actionsHelp(true)).toMatch(/Edit:.*Move into case:.*Pending/);
    expect(actionsHelp(false)).not.toMatch(/Move into case/);
  });
});

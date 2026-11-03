/**
 * The console entry for the read-only report of stored senders with an address hidden in the
 * display name (BE `POST /api/system/spoofed-sender-report`, R2-SEC).
 */
import { describe, expect, it } from 'vitest';
import { REPAIRS } from '../repairCatalog';

describe('spoofed-sender-report entry', () => {
  const entry = REPAIRS.find((repair) => repair.id === 'spoofed-sender-report');

  it('posts to the backend route, per workspace, as a report with no Apply', () => {
    expect(entry).toMatchObject({ path: 'spoofed-sender-report', scope: 'workspace' });
    // POST (the default): a GET would drop the `afterEventId` the paged Check sends.
    expect(entry?.method).toBeUndefined();
    expect(entry?.checkOnly).toBe(true);
  });

  it('continues from where a run stopped (the backend pages by event id)', () => {
    expect(entry?.pagedByEventId).toBe(true);
  });
});

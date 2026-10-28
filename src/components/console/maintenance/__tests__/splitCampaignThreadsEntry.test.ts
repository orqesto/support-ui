/**
 * The console entry for the repair that splits threads where several customers replied to one email
 * the workspace sent to many (BE `POST /api/system/split-campaign-threads`).
 */
import { describe, expect, it } from 'vitest';
import { REPAIRS } from '../repairCatalog';

describe('split-campaign-threads repair entry', () => {
  const entry = REPAIRS.find((repair) => repair.id === 'split-campaign-threads');

  it('posts to the backend route, per workspace, with Check before Apply', () => {
    expect(entry).toMatchObject({ path: 'split-campaign-threads', scope: 'workspace' });
    // POST (the default), and not report-only: Check, then Apply.
    expect(entry?.method).toBeUndefined();
    expect(entry?.checkOnly).toBeFalsy();
  });

  it('continues from where a run stopped (the backend pages by conversation id)', () => {
    expect(entry?.pagedByEventId).toBe(true);
  });

  it('warns before Apply that messages move', () => {
    expect(entry?.caution).toMatch(/Moves/);
  });
});

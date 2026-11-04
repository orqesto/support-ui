/**
 * The console entry for the one-off that refreshes AI drafts written for an older customer email
 * (BE `POST /api/system/repair-stale-drafts`, support-service #1345; taco ORB-SUP-1719).
 */
import { describe, expect, it } from 'vitest';
import { REPAIRS } from '../repairCatalog';

describe('repair-stale-drafts entry', () => {
  const entry = REPAIRS.find((repair) => repair.id === 'repair-stale-drafts');

  it('posts to the backend route, per workspace, with Check before Apply', () => {
    expect(entry).toMatchObject({ path: 'repair-stale-drafts', scope: 'workspace' });
    expect(entry?.method).toBeUndefined();
    expect(entry?.checkOnly).toBeFalsy();
  });

  it('warns before Apply that each thread costs an AI draft', () => {
    expect(entry?.caution).toMatch(/AI draft/);
  });
});

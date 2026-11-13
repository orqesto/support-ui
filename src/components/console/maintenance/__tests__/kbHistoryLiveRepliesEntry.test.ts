/**
 * The console entry for the repair of tickets that stayed in Pending after the customer answered
 * on a thread first imported as knowledge-base history (BE `POST /api/system/repair-kb-history-live-replies`;
 * taco DEU-SUP-13723, 2026-11-13).
 */
import { describe, expect, it } from 'vitest';
import { REPAIRS } from '../repairCatalog';

describe('repair-kb-history-live-replies entry', () => {
  const entry = REPAIRS.find((repair) => repair.id === 'repair-kb-history-live-replies');

  it('posts to the backend route, per workspace, with Check before Apply', () => {
    expect(entry).toMatchObject({ path: 'repair-kb-history-live-replies', scope: 'workspace' });
    expect(entry?.method).toBeUndefined();
    expect(entry?.checkOnly).toBeFalsy();
  });

  it('says what it leaves alone', () => {
    expect(entry?.does).toMatch(/left alone/);
  });
});

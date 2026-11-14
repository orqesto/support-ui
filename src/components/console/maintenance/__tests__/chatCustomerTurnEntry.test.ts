/**
 * The console entry for the repair of chat tickets (Telegram, WhatsApp) that stayed in
 * Pending after the customer wrote again (BE `POST /api/system/repair-chat-customer-turn`,
 * 2026-11-13).
 */
import { describe, expect, it } from 'vitest';
import { moreRemains, REPAIRS } from '../repairCatalog';

describe('repair-chat-customer-turn entry', () => {
  const entry = REPAIRS.find((repair) => repair.id === 'repair-chat-customer-turn');

  it('posts to the backend route, per workspace, with Check before Apply', () => {
    expect(entry).toMatchObject({ path: 'repair-chat-customer-turn', scope: 'workspace' });
    expect(entry?.method).toBeUndefined();
    expect(entry?.checkOnly).toBeFalsy();
    expect(entry?.pagedByEventId).toBeFalsy();
  });

  it('sits next to the knowledge-base-history Pending repair', () => {
    const ids = REPAIRS.map((repair) => repair.id);
    expect(ids.indexOf('repair-chat-customer-turn')).toBe(
      ids.indexOf('repair-kb-history-live-replies') + 1
    );
  });

  it('says what it leaves alone', () => {
    expect(entry?.does).toMatch(/left alone/);
  });

  it('names Telegram and WhatsApp only: Slack cannot tell the customer from the team', () => {
    expect(entry?.does).toMatch(/^Telegram and WhatsApp tickets/);
    expect(entry?.does).toMatch(/Slack and email threads are left alone/);
  });

  it('a result cut by the limit reads as "more remain"; a complete one does not', () => {
    const result = {
      applied: false,
      organizationId: 1,
      candidates: 500,
      repaired: 0,
      movedToClientReplied: 0,
      skipped: 0,
      failed: 0,
      conversationIds: [11, 12],
    };
    expect(moreRemains({ ...result, truncated: true })).toBe(true);
    expect(moreRemains({ ...result, truncated: false })).toBe(false);
  });
});

/**
 * The pure rules behind merge and Reply all (owner, 2026-09-23). The fixture is prod's
 * ODL-SUP-19 + ODL-MKT-1: one person writing from `mp@deals.badideas.fund` and `mp@badideas.fund`.
 */
import { describe, expect, it } from 'vitest';
import { defaultSurvivor } from '../MergeConfirmDialog';
import { customerDomainQuery } from '../MergeThreads';
import { replyAllDraft } from '../RecipientFields';
import { mergedFromId } from '../useThreadMergeContext';

describe('defaultSurvivor', () => {
  it('keeps the OLDER ticket (D1) whichever order they were picked in', () => {
    const sup19 = { id: 29312, createdAt: '2026-08-31T07:18:23Z' };
    const mkt1 = { id: 30384, createdAt: '2026-09-23T12:54:03Z' };
    expect(defaultSurvivor([mkt1, sup19])?.id).toBe(29312);
    expect(defaultSurvivor([sup19, mkt1])?.id).toBe(29312);
  });

  it('never picks a ticket with an unknown date over one with a date', () => {
    expect(defaultSurvivor([{ id: 1 }, { id: 2, createdAt: '2026-09-01T00:00:00Z' }])?.id).toBe(2);
  });
});

describe('customerDomainQuery', () => {
  it('finds BOTH addresses of the same customer', () => {
    expect(customerDomainQuery('mp@deals.badideas.fund')).toBe('badideas.fund');
    expect(customerDomainQuery('mp@badideas.fund')).toBe('badideas.fund');
  });

  it('passes anything that is not an address through', () => {
    expect(customerDomainQuery('')).toBe('');
    expect(customerDomainQuery(undefined)).toBe('');
  });
});

describe('replyAllDraft', () => {
  const empty = { to: '', cc: '', bcc: '' };
  const people = ['mp@badideas.fund', 'deals@badideas.fund', 'mp@deals.badideas.fund'];

  it('puts everyone except who we are answering into Cc', () => {
    expect(replyAllDraft(empty, 'mp@badideas.fund', people).cc).toBe(
      'deals@badideas.fund, mp@deals.badideas.fund'
    );
  });

  it('never adds someone already in To, Cc or Bcc — in any case', () => {
    const draft = { to: '', cc: 'DEALS@badideas.fund', bcc: 'mp@deals.badideas.fund' };
    expect(replyAllDraft(draft, 'mp@badideas.fund', people).cc).toBe('DEALS@badideas.fund');
  });

  it('answers the typed To, not the default, when the agent chose one', () => {
    const draft = { ...empty, to: 'deals@badideas.fund' };
    expect(replyAllDraft(draft, 'mp@badideas.fund', people).cc).toBe(
      'mp@badideas.fund, mp@deals.badideas.fund'
    );
  });
});

describe('mergedFromId', () => {
  it('reads the LAST ticket on the trail — the one this message was merged in from', () => {
    expect(mergedFromId({ metadata: { mergeTrail: [11, 22] } })).toBe(22);
  });

  it('is null for a message that never moved', () => {
    expect(mergedFromId({ metadata: null })).toBeNull();
    expect(mergedFromId({ metadata: { mergeTrail: [] } })).toBeNull();
    expect(mergedFromId({ metadata: { mergeTrail: 'x' } })).toBeNull();
  });
});

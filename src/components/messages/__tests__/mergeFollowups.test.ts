/**
 * Staging, 2026-09-24 — three things the browser check of the merge found.
 */
import { describe, expect, it } from 'vitest';
import { displayIdIfRedirected } from '@/hooks/useMessagesUrlSync';
import { customerDomainQuery } from '../MergeThreads';

describe('customerDomainQuery — public providers', () => {
  it('searches the customer’s own address, not every Gmail sender', () => {
    expect(customerDomainQuery('ecttet@gmail.com')).toBe('ecttet@gmail.com');
    expect(customerDomainQuery('Dmitry Skumin <ecttet@gmail.com>')).toBe('ecttet@gmail.com');
    expect(customerDomainQuery('evija@inbox.lv')).toBe('evija@inbox.lv');
  });

  it('still searches a company domain, so two addresses of one person both show', () => {
    expect(customerDomainQuery('mp@deals.badideas.fund')).toBe('badideas.fund');
    expect(customerDomainQuery('"Mārtiņš" <mp@badideas.fund>')).toBe('badideas.fund');
  });
});

describe('displayIdIfRedirected', () => {
  const survivor = { id: 6439, publicId: 'INF-25' };

  it('names the ticket actually shown when a merged-away link opened another', () => {
    expect(displayIdIfRedirected('ADM-SUP-7', survivor, 'ADM')).toBe('ADM-INF-25');
  });

  it('leaves an ordinary open alone, whichever form the link used', () => {
    expect(displayIdIfRedirected('ADM-INF-25', survivor, 'ADM')).toBeNull();
    expect(displayIdIfRedirected('inf-25', survivor, 'ADM')).toBeNull();
    expect(displayIdIfRedirected('6439', survivor, 'ADM')).toBeNull();
    // Before the workspace code has loaded, the full display id is still this ticket.
    expect(displayIdIfRedirected('ADM-INF-25', survivor, undefined)).toBeNull();
  });
});

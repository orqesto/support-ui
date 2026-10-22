import { describe, it, expect } from 'vitest';
import { ticketDisplayId } from '../ticketReference';

describe('ticketDisplayId', () => {
  it('adds the workspace code to the reference the backend sends', () => {
    expect(ticketDisplayId({ id: 21, reference: 'SUP-T-42' }, 'ACME')).toBe('ACME-SUP-T-42');
    expect(ticketDisplayId({ id: 21, reference: 'BIL-SUP-T-42' }, 'ACME')).toBe('ACME-BIL-SUP-T-42');
  });

  it('shows the bare reference while the workspace code is unknown', () => {
    expect(ticketDisplayId({ id: 21, reference: 'SUP-T-42' }, undefined)).toBe('SUP-T-42');
  });

  it('falls back to #id without a reference — an older backend, or no number yet', () => {
    expect(ticketDisplayId({ id: 21 }, 'ACME')).toBe('#21');
    expect(ticketDisplayId({ id: 21, reference: null }, 'ACME')).toBe('#21');
  });

  it('never shows a publicId: an older backend copied the thread’s number into it', () => {
    const olderBackend = { id: 21, publicId: 'SUP-14' } as { id: number; publicId: string };
    expect(ticketDisplayId(olderBackend, 'ACME')).toBe('#21');
  });
});

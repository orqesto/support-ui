/**
 * An id in a URL must carry the org code, because that is the form that fails safe.
 *
 * ⛔ THE ASYMMETRY THIS PINS. `getConvUrlId` has always taken an optional `orgCode`, and the
 * copy-link buttons passed it while every URL-SYNC writer omitted it. So the button produced
 * `ORB-MKT-170` and the address bar produced a bare `MKT-170` — and people copy the address
 * bar. The bare form is the ambiguous one: public ids are unique per ORG with a per-department
 * counter, so on prod `INF` and `SUP` each exist in SIX workspaces and 54 ids already resolve
 * in more than one.
 *
 * 🔑 The coded form is not merely clearer. The backend's `resolveConvIdFromParam` strips a
 * MATCHING `{code}-` and returns null for a non-matching one, so a link opened in the wrong
 * workspace 404s instead of opening a different real conversation. Dropping the code throws
 * that protection away.
 */
import { describe, it, expect } from 'vitest';
import { getConvUrlId, formatConvId } from '@/lib/messageHelpers';

const conv = { id: 10969, publicId: 'MKT-170' };

describe('getConvUrlId', () => {
  it('carries the org code when one is known — the shareable, fail-safe form', () => {
    expect(getConvUrlId(conv, 'ORB')).toBe('ORB-MKT-170');
  });

  it('matches the chip the agent sees, so the URL and the UI agree', () => {
    expect(getConvUrlId(conv, 'ORB')).toBe(formatConvId(conv, 'ORB'));
  });

  it('falls back to the bare id when the org has no code', () => {
    // `organizations.code` is nullable until backfilled, and a self-hosted install may
    // never have one. Bare is worse, not broken — the backend still accepts it.
    expect(getConvUrlId(conv, null)).toBe('MKT-170');
    expect(getConvUrlId(conv, undefined)).toBe('MKT-170');
  });

  it('CONTROL: an unstamped conversation uses its numeric id and is never org-prefixed', () => {
    // A numeric id is already globally unique; prefixing it would invent an id shape the
    // backend does not parse.
    expect(getConvUrlId({ id: 16952, publicId: null }, 'ORB')).toBe('16952');
  });
});

/**
 * The one reader both customer-identity surfaces use.
 *
 * It exists because the first pass at this feature fixed the ticket-detail bubble and
 * left the Q&A pair view rendering the relay — two surfaces, one rule, and no shared
 * place to put it. The branch logic is pinned here so a third surface can adopt it
 * without re-deriving (or re-breaking) the guards.
 */
import { describe, it, expect } from 'vitest';
import { bareAddress, relayedFromLabel } from '../relayedFrom';

const msg = (authorEmail: string | null, relayedFrom?: Record<string, unknown> | null) =>
  ({ authorEmail, metadata: relayedFrom === undefined ? null : { relayedFrom } }) as never;

describe('bareAddress', () => {
  it('unwraps a display-name header', () => {
    expect(bareAddress('"Orbelli (Shopify)" <mailer@shopify.com>')).toBe('mailer@shopify.com');
  });

  it('passes a plain address through, lowercased', () => {
    expect(bareAddress('MARK@Hotmail.com')).toBe('mark@hotmail.com');
  });

  it('is empty for a missing header rather than throwing', () => {
    expect(bareAddress(null)).toBe('');
    expect(bareAddress(undefined)).toBe('');
  });
});

describe('relayedFromLabel', () => {
  it('names the person and what the message came through', () => {
    expect(
      relayedFromLabel(
        msg('"Orbelli (Shopify)" <mailer@shopify.com>', {
          email: 'safina.pathaan@gmail.com',
          name: 'safina patha',
        })
      )
    ).toEqual({ email: 'safina.pathaan@gmail.com', name: 'safina patha', via: 'mailer@shopify.com' });
  });

  it('reports no name rather than an empty one', () => {
    // The backend stamps `name: null` when the form carried no Name: field, and a
    // whitespace-only value would otherwise render as a blank author.
    expect(relayedFromLabel(msg('<mailer@shopify.com>', { email: 'a@b.com', name: '   ' }))?.name).toBeNull();
    expect(relayedFromLabel(msg('<mailer@shopify.com>', { email: 'a@b.com' }))?.name).toBeNull();
  });

  // ── The three nulls. Each is a control for a different way this could misfire. ──

  it('is null for ordinary mail', () => {
    expect(relayedFromLabel(msg('mark@hotmail.com'))).toBeNull();
    expect(relayedFromLabel(msg('mark@hotmail.com', null))).toBeNull();
  });

  it('is null when the stamp names the envelope sender itself', () => {
    // The history repair stamps this key on rows recovered from the envelope
    // (`inbound-author-backfill`). Those are already correct; a label would read
    // "mark@hotmail.com · via mark@hotmail.com".
    expect(
      relayedFromLabel(msg('mark sommerford <mark@hotmail.com>', { email: 'MARK@hotmail.com' }))
    ).toBeNull();
  });

  it('is null when there is no envelope address to name', () => {
    expect(relayedFromLabel(msg(null, { email: 'a@b.com' }))).toBeNull();
  });
});

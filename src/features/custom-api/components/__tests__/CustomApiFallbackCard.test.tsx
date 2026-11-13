/**
 * 2026-11-13: a chained card whose source found NO ACCOUNT and that searched by the customer's email
 * instead (the backend's `fallback`: the email and how many rows it hid). The owner's wording:
 * found → "No account — guest orders found by email <address>"; none → "No account, and no guest
 * orders for <address>"; rows hidden → how many. Fixtures are what the backend sends; invented data.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiResultCard } from '../CustomApiResultCard';
import { fallbackText } from '../../lib/customApiLookupText';
import type { CustomApiLookupResult } from '@/features/custom-api';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

const post = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]): unknown => post(...args), get: vi.fn() },
}));
const { customApiLookupService } = await import('../../services/customApiLookup.service');

const EMAIL = 'guest.buyer@shop.example';

/** What the backend sends for a chained "orders" card that ran its fallback. */
const card = (over: Partial<CustomApiLookupResult> = {}): CustomApiLookupResult =>
  ({
    endpointId: 50,
    label: 'Their orders',
    connectionName: 'Example shop',
    resultShape: 'many',
    category: 'order',
    referenceLabel: null,
    noMatchHint: null,
    status: 'ok',
    rows: [{ order_id: 'G-1', email: EMAIL }],
    fields: [
      { path: 'order_id', label: 'Order', kind: 'plain', role: 'identifier' },
      { path: 'email', label: 'Email', kind: 'plain', role: 'customer_email' },
    ],
    total: 1,
    searchedFor: { kind: 'email', value: EMAIL },
    fallback: { email: EMAIL, dropped: 0 },
    ownership: 'owned',
    ...over,
  }) as CustomApiLookupResult;
const none = (dropped = 0) =>
  card({
    status: 'no_match',
    rows: undefined,
    fields: undefined,
    total: undefined,
    ownership: undefined,
    fallback: { email: EMAIL, dropped },
  });

const show = (result: CustomApiLookupResult) =>
  render(
    <MemoryRouter>
      <CustomApiResultCard result={result} busy={false} referenceInput="card" />
    </MemoryRouter>
  );

beforeEach(() => {
  post.mockReset();
  useAuthStore.setState({
    selectedOrganizationId: 1,
    user: { id: 9, role: 'user', organizationRole: 'support' } as User,
  });
});

describe('fallbackText — the owner’s wording', () => {
  it('found', () => {
    expect(fallbackText(card())).toBe(`No account — guest orders found by email ${EMAIL}.`);
  });
  it('none', () => {
    expect(fallbackText(none())).toBe(`No account, and no guest orders for ${EMAIL}.`);
  });
  it('🔴 rows hidden are always counted — found and none', () => {
    // RED: drop the `dropped` sentence ⇒ "none" and "we hid 2" read the same.
    expect(fallbackText(card({ fallback: { email: EMAIL, dropped: 2 } }))).toBe(
      `No account — guest orders found by email ${EMAIL}. 2 more orders were hidden because their email didn’t match.`
    );
    expect(fallbackText(none(1))).toBe(
      `No account, and no guest orders for ${EMAIL}. 1 order was hidden because its email didn’t match.`
    );
  });
  it('CONTROL: no fallback, or a failed fallback, says nothing here', () => {
    expect(fallbackText(card({ fallback: undefined }))).toBeNull();
    expect(fallbackText(card({ status: 'failed', rows: undefined }))).toBeNull();
  });
});

describe('the card', () => {
  it('🔴 found: keeps its title, shows the note and the rows', () => {
    // RED: drop the note from the card ⇒ the agent cannot tell these are guest orders by email.
    show(card({ fallback: { email: EMAIL, dropped: 3 } }));
    expect(screen.getByText('Their orders')).toBeInTheDocument();
    expect(screen.getByTestId('lookup-fallback-note')).toHaveTextContent(
      `No account — guest orders found by email ${EMAIL}. 3 more orders were hidden because their email didn’t match.`
    );
    expect(screen.getByText('G-1')).toBeInTheDocument();
  });

  it('🔴 none: the none sentence replaces the generic not-found line', () => {
    show(none(2));
    expect(screen.getByTestId('lookup-fallback-note')).toHaveTextContent(
      `No account, and no guest orders for ${EMAIL}. 2 orders were hidden because their email didn’t match.`
    );
    expect(screen.queryByText(`Nothing in Example shop for ${EMAIL}.`)).not.toBeInTheDocument();
  });

  it('CONTROL: a card without a fallback renders as before', () => {
    show(card({ fallback: undefined, searchedFor: { kind: 'source', label: 'Account' } }));
    expect(screen.queryByTestId('lookup-fallback-note')).not.toBeInTheDocument();
    show({
      ...none(),
      fallback: undefined,
      skippedBecause: { reason: 'source_no_match', sourceLabel: 'Account' },
    });
    expect(screen.getByText('Skipped — Account found nothing.')).toBeInTheDocument();
  });
});

describe('the service keeps it, and drops a malformed one (FE/BE skew)', () => {
  const run = async (fallback: unknown) => {
    post.mockResolvedValue({ data: { success: true, data: [{ ...none(), fallback }] } });
    return (await customApiLookupService.run({ conversationId: 1 }))[0];
  };

  it('🔴 a well-formed fallback passes through', async () => {
    // RED: leave it out of `normalise` ⇒ the destructure drops it and the note never shows.
    expect((await run({ email: EMAIL, dropped: 2 })).fallback).toEqual({
      email: EMAIL,
      dropped: 2,
    });
  });

  it('malformed or absent ⇒ none; a bad count reads as 0', async () => {
    expect((await run({ dropped: 2 })).fallback).toBeUndefined();
    expect((await run('nope')).fallback).toBeUndefined();
    expect((await run(undefined)).fallback).toBeUndefined();
    expect((await run({ email: EMAIL, dropped: -1 })).fallback).toEqual({
      email: EMAIL,
      dropped: 0,
    });
  });
});

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
const { customApiService } = await import('../../services/customApi.service');

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

const ORDERS = { one: 'order', many: 'orders' };

describe('fallbackText — the owner’s wording', () => {
  it('found', () => {
    expect(fallbackText(card(), ORDERS)).toBe(`No account — guest orders found by email ${EMAIL}.`);
  });
  it('none', () => {
    expect(fallbackText(none(), ORDERS)).toBe(`No account, and no guest orders for ${EMAIL}.`);
  });
  it('🔴 rows hidden are always counted — found and none', () => {
    // RED: drop the `dropped` sentence ⇒ "none" and "we hid 2" read the same.
    expect(fallbackText(card({ fallback: { email: EMAIL, dropped: 2 } }), ORDERS)).toBe(
      `No account — guest orders found by email ${EMAIL}. 2 more orders were hidden because their email didn’t match.`
    );
    expect(fallbackText(none(1), ORDERS)).toBe(
      `No account, and no guest orders for ${EMAIL}. 1 order was hidden because its email didn’t match.`
    );
  });
  it('🔴 every row read was hidden and more were never read ⇒ "more not checked"', () => {
    // RED: say "no guest orders" ⇒ a claim about a search we did not finish.
    expect(
      fallbackText({ ...none(), fallback: { email: EMAIL, dropped: 25, more: true } }, ORDERS)
    ).toBe(
      `No account; the first 25 guest orders by email ${EMAIL} didn’t match, more not checked.`
    );
  });
  it('🔴 a failed guest search still says there is no account (the reason stays on the red line)', () => {
    // RED: say nothing on a failure ⇒ the agent cannot tell the account lookup found nobody.
    expect(
      fallbackText(card({ status: 'failed', rows: undefined, agentReason: 'timeout' }), ORDERS)
    ).toBe(`No account; the guest search by ${EMAIL} failed.`);
  });
  it('🔴 pages unread and nothing read ⇒ never "the first 0"', () => {
    expect(
      fallbackText({ ...none(), fallback: { email: EMAIL, dropped: 0, more: true } }, ORDERS)
    ).toBe(`No account; nothing was read from the guest search by ${EMAIL} — more not checked.`);
  });
  it('a lookup with no category reads with the generic record word', () => {
    expect(fallbackText(card({ category: null, fallback: { email: EMAIL, dropped: 1 } }))).toBe(
      `No account — guest records found by email ${EMAIL}. 1 more record was hidden because its email didn’t match.`
    );
  });
  it('CONTROL: no fallback says nothing here', () => {
    expect(fallbackText(card({ fallback: undefined }), ORDERS)).toBeNull();
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

  it('keeps `more` (every row read hidden, more not checked)', async () => {
    // RED: drop it in `normalise` ⇒ the card says "no guest orders" about an unfinished search.
    expect((await run({ email: EMAIL, dropped: 3, more: true })).fallback).toEqual({
      email: EMAIL,
      dropped: 3,
      more: true,
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

describe('owner 2026-11-13 — a hidden check field never reaches the card', () => {
  it('what the backend sends for a hidden email field renders no email', () => {
    // The backend leaves a hidden field out of `rows` and `fields` (customApiConfiguredFields).
    show(card({ rows: [{ order_id: 'G-1' }], fields: [card().fields![0]] }));
    expect(screen.getByText('G-1')).toBeInTheDocument();
    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();
  });

  it('CONTROL: a shown email field still renders', () => {
    show(card({ fallback: undefined }));
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });
});

describe('2026-11-13 review — the card', () => {
  it('🔴 a failed guest search shows the no-account note, and the reason once', () => {
    // RED: put the reason in the note too ⇒ the same sentence twice on one card.
    show(card({ status: 'failed', rows: undefined, agentReason: 'timeout' }));
    expect(screen.getByTestId('lookup-fallback-note')).toHaveTextContent(
      `No account; the guest search by ${EMAIL} failed.`
    );
    expect(screen.getAllByText(/took too long to answer/)).toHaveLength(1);
  });

  it('🔴 an account-category lookup reads with neutral “records”, never “guest accounts”', () => {
    show(card({ category: 'account' }));
    expect(screen.getByTestId('lookup-fallback-note')).toHaveTextContent(
      `No account — guest records found by email ${EMAIL}.`
    );
  });

  it('🔴 all fields hidden keeps the count of the total and “there may be more”', () => {
    // RED: drop them ⇒ "2 found" when the vendor has 37.
    show(card({ rows: [{}, {}], fields: [], total: 37 }));
    expect(screen.getByTestId('lookup-details-hidden')).toHaveTextContent(
      '2 of 37 found — details hidden.'
    );
    show(card({ rows: [{}], fields: [], total: null, more: true }));
    expect(screen.getAllByTestId('lookup-details-hidden')[1]).toHaveTextContent(
      '1 found — details hidden. There may be more.'
    );
  });

  it('🔴 every field hidden ⇒ the count and “details hidden”, never blank row cards', () => {
    // RED: render RowFields for empty rows ⇒ two blank cards and no sentence.
    show(card({ rows: [{}, {}], fields: [] }));
    expect(screen.getByTestId('lookup-details-hidden')).toHaveTextContent(
      '2 found — details hidden.'
    );
  });

  it('CONTROL: rows with shown fields render as rows, with no such note', () => {
    show(card());
    expect(screen.queryByTestId('lookup-details-hidden')).not.toBeInTheDocument();
  });
});

describe('Test fallback through the real service', () => {
  it('🔴 keeps the kept / hidden counts; CONTROL: an ordinary Test has none', async () => {
    // RED: drop them in normaliseTestResult ⇒ the admin never sees a wrong email field.
    post.mockResolvedValue({
      data: {
        data: { outcome: { status: 'ok', rows: [] }, paths: [], fallback: { kept: 1, dropped: 4 } },
      },
    });
    const result = await customApiService.sendTest(1, 50, EMAIL, '/o?email={value}');
    expect(result.fallback).toEqual({ kept: 1, dropped: 4 });
    expect(post.mock.calls[0][1]).toEqual({ parameter: EMAIL, fallbackPath: '/o?email={value}' });
    post.mockResolvedValue({
      data: { data: { outcome: { status: 'ok', rows: [] }, paths: ['a'] } },
    });
    expect(await customApiService.sendTest(1, 50, 'x')).not.toHaveProperty('fallback');
  });
});

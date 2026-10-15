/**
 * The panel explains itself (2026-10-14): what a press will check, which typed-value lookup is
 * left after an email found nothing (A3), and what an agent and an admin each read on a card that
 * needs an admin (D1). Split from `CustomApiLookupPanel.test.tsx` for the file-size limit; the same
 * harness, neutral fixtures.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiLookupPanel } from '../CustomApiLookupPanel';
import type * as LookupService from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

type CustomApiLookupResult = LookupService.CustomApiLookupResult;

const run = vi.fn<(body: unknown) => Promise<CustomApiLookupResult[]>>();
const availability = vi.fn<(surface: string) => Promise<boolean>>();
const lookupOptions = vi.fn<(surface: string) => Promise<unknown[]>>();

vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>('@/services/customApiLookup.service');
  return {
    ...actual,
    customApiLookupService: {
      run: (body: unknown) => run(body),
      availability: (surface: string) => availability(surface),
      lookupOptions: (surface: string) => lookupOptions(surface),
    },
  };
});

const card = (over: Partial<CustomApiLookupResult> = {}): CustomApiLookupResult =>
  ({
    endpointId: 20,
    label: 'this order',
    connectionName: 'Militech',
    resultShape: 'one',
    status: 'ok',
    rows: [{ order_id: '137416' }],
    fields: [{ path: 'order_id', label: 'Order', kind: 'plain' }],
    ...over,
  }) as CustomApiLookupResult;

const press = async (name = /look up/i) => {
  await userEvent.click((await screen.findAllByRole('button', { name }))[0]);
};

const render = (ui: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return rtlRender(ui, { wrapper });
};

/** D1: an admin (MANAGE_INTEGRATIONS) — the only viewer who sees raw reasons and shape paths. */
const asAdmin = () =>
  useAuthStore.setState({
    selectedOrganizationId: 1,
    user: { id: 9, role: 'user', organizationRole: 'org_admin' } as User,
  });

beforeEach(() => {
  run.mockReset();
  availability.mockReset();
  availability.mockResolvedValue(true);
  lookupOptions.mockReset();
  lookupOptions.mockResolvedValue([]);
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

describe('shape_changed — an admin sees the paths, an agent is sent to an admin (D1)', () => {
  it('SC4b — shape_changed NAMES the missing fields', async () => {
    // RED: render it as empty ⇒ a dead integration is indistinguishable from a customer we have no
    // data for, which is the sibling of SC2 and the reason both states exist.
    run.mockResolvedValue([
      card({ status: 'shape_changed', missing: ['order_id', 'total'], rows: [], fields: [] }),
    ]);
    asAdmin();
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/no longer matches what was configured/i)).toBeTruthy();
    expect(screen.getByText(/order_id, total/)).toBeTruthy();
  });

  it('a RECORDS miss does not claim the response "no longer" matches', async () => {
    /**
     * ⛔ A CLAIM ABOUT HISTORY. `shape_changed` now also carries "we could not find the record list
     * at all", which is true of a lookup that NEVER worked — so "no longer matches" describes a
     * past that did not happen, and points the agent at fields rather than at the real problem.
     */
    run.mockResolvedValue([
      card({
        status: 'shape_changed',
        missingKind: 'records',
        missing: ['data'],
        rows: [],
        fields: [],
      }),
    ]);
    asAdmin();
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/could not find any records/i)).toBeTruthy();
    expect(screen.queryByText(/no longer matches/i)).toBeNull();
  });

  it('D1 — an agent is sent to an admin and sees no paths', async () => {
    run.mockResolvedValue([
      card({ status: 'shape_changed', missing: ['order_id', 'total'], rows: [], fields: [] }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    expect(await screen.findByText('This lookup needs attention from an admin.')).toBeTruthy();
    expect(screen.queryByText(/order_id, total/)).toBeNull();
  });

  it('an OLDER backend with no missingKind keeps the original wording', async () => {
    run.mockResolvedValue([
      card({ status: 'shape_changed', missing: ['order_id'], rows: [], fields: [] }),
    ]);
    asAdmin();
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();

    expect(await screen.findByText(/no longer matches what was configured/i)).toBeTruthy();
  });
});

const option = (over: Record<string, unknown>) => ({
  endpointId: 2,
  label: 'By id',
  connectionName: 'Militech',
  parameterSource: 'manual',
  resultShape: 'one',
  category: null,
  storesRecords: true,
  ...over,
});

describe('2026-10-14 — the pane explains itself', () => {
  it('before any press it names the systems a press will ask', async () => {
    lookupOptions.mockResolvedValue([
      option({
        endpointId: 1,
        label: 'Account',
        connectionName: 'Acme',
        parameterSource: 'identity',
      }),
      option({ endpointId: 2 }),
      option({ endpointId: 3, connectionName: 'Acme' }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    expect(
      await screen.findByText('Check Acme and Militech for this customer.')
    ).toBeInTheDocument();
  });

  it('the prompt goes once a press has run', async () => {
    run.mockResolvedValue([card()]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await screen.findByText(/^Check .* for /);
    await press();
    await screen.findByText('137416');
    expect(screen.queryByText(/^Check .* for /)).toBeNull();
  });

  it('an older backend without options (404 or 400) still says something', async () => {
    for (const status of [404, 400]) {
      lookupOptions.mockRejectedValue(Object.assign(new Error('nope'), { status }));
      const { unmount } = render(<CustomApiLookupPanel conversationId={1} />);
      expect(
        await screen.findByText('Check the connected systems for this customer.')
      ).toBeInTheDocument();
      unmount();
    }
  });

  it('A3 — an email no-match offers the typed-value lookup of the same connection, by its name', async () => {
    lookupOptions.mockResolvedValue([option({ referenceLabel: 'User id' })]);
    run.mockResolvedValue([
      card({
        endpointId: 1,
        status: 'no_match',
        rows: [],
        fields: [],
        searchedFor: { kind: 'email', value: 'nobody@example.com' },
      }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    expect(
      await screen.findByText('Nothing in Militech for nobody@example.com.')
    ).toBeInTheDocument();
    expect(screen.getByText('You can still look up by User id below.')).toBeInTheDocument();
  });

  it('A3 — without options, a waiting typed-value card of the same connection is used', async () => {
    lookupOptions.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    run.mockResolvedValue([
      card({
        endpointId: 1,
        status: 'no_match',
        rows: [],
        fields: [],
        searchedFor: { kind: 'email', value: 'nobody@example.com' },
      }),
      card({ endpointId: 2, status: 'needs_input', rows: [], fields: [], referenceLabel: null }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    expect(
      await screen.findByText('You can still look up by Reference below.')
    ).toBeInTheDocument();
  });

  it('CONTROL: no typed-value lookup on that connection → no hint', async () => {
    lookupOptions.mockResolvedValue([
      option({ connectionName: 'Acme', referenceLabel: 'User id' }),
    ]);
    run.mockResolvedValue([
      card({
        status: 'no_match',
        rows: [],
        fields: [],
        searchedFor: { kind: 'email', value: 'nobody@example.com' },
      }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} />);
    await press();
    await screen.findByText('Nothing in Militech for nobody@example.com.');
    expect(screen.queryByText(/You can still look up/)).toBeNull();
  });
});

describe('2026-10-15 — the idle pane reads top-down, and the badge counts what was found', () => {
  it('names the address and the lookups a press will run', async () => {
    lookupOptions.mockResolvedValue([
      option({ endpointId: 1, label: 'Account', connectionName: 'Acme' }),
      option({ endpointId: 2, label: 'Orders', connectionName: 'Acme' }),
    ]);
    render(<CustomApiLookupPanel conversationId={1} customerEmail="buyer@example.com" />);
    expect(await screen.findByText('Check Acme for buyer@example.com.')).toBeInTheDocument();
    expect(screen.getByText('2 lookups: Account · Orders')).toBeInTheDocument();
  });

  it('CONTROL: an older backend without options names no lookups', async () => {
    lookupOptions.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }));
    render(<CustomApiLookupPanel conversationId={1} />);
    await screen.findByText('Check the connected systems for this customer.');
    expect(screen.queryByText(/lookups?:/)).toBeNull();
  });

  it('reports 0 before a press, the found count after, and 0 when the panel goes', async () => {
    const onFoundChange = vi.fn();
    run.mockResolvedValue([
      card(),
      card({ endpointId: 21, rows: [{ order_id: '2' }], ownership: 'mismatch' }),
      card({ endpointId: 22, status: 'no_match', rows: [] }),
      card({ endpointId: 23, rows: [] }),
    ]);
    const { unmount } = render(
      <CustomApiLookupPanel conversationId={1} onFoundChange={onFoundChange} />
    );
    await screen.findByText(/^Check .* for /);
    expect(onFoundChange).toHaveBeenLastCalledWith(0);
    await press();
    await screen.findByText('137416');
    // Only the first card counts: someone else's record, a no-match and an empty ok do not.
    expect(onFoundChange).toHaveBeenLastCalledWith(1);
    unmount();
    expect(onFoundChange).toHaveBeenLastCalledWith(0);
  });
});

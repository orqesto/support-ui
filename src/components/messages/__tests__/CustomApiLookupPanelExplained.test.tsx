/**
 * The panel explains itself (2026-10-14): what an agent and an admin each read on a card that
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

vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>('@/services/customApiLookup.service');
  return {
    ...actual,
    customApiLookupService: {
      run: (body: unknown) => run(body),
      availability: (surface: string) => availability(surface),
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

/**
 * The section's WIRING — audit pass 11.
 *
 * ⛔ Every piece here is tested on its own: the list renders cards, the vendor form saves, the
 * wizard picks fields. None of that notices if "Manage" opens the LOOKUP wizard, or if "Add a
 * lookup" opens the VENDOR form — the handlers are three lines of plumbing with identical types,
 * and a swap type-checks perfectly. That is the same shape as the gap the mounting test was
 * written for: working parts, wired to nothing or to the wrong thing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomApiSection } from '../CustomApiSection';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

const list = vi.fn<() => Promise<Connection[]>>();

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: { ...actual.customApiService, list: () => list() },
  };
});

const connection = (): Connection => ({
  id: 1,
  name: 'DeusPower',
  purpose: null,
  baseUrl: 'https://shop.example/index.php',
  enabled: true,
  authType: 'header',
  authHeaderName: 'X-Oc-Restadmin-Id',
  hasCredential: true,
  headers: {},
  timeoutMs: 10000,
  scopeMode: 'all',
  piiAcknowledgedBy: 7,
  piiAcknowledgedAt: '2026-09-19T10:00:00.000Z',
  departmentIds: [],
  endpoints: [],
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
});

beforeEach(() => {
  list.mockReset().mockResolvedValue([connection()]);
});

describe('Settings › Integrations › Custom APIs — the dialogs are wired to the right buttons', () => {
  it('“Manage” opens the VENDOR form', async () => {
    const user = userEvent.setup();
    render(<CustomApiSection canManageVendors />);
    await waitFor(() => expect(screen.getByText('DeusPower')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    // The vendor form, identified by something only it has: the D42 acknowledgement is absent on
    // an edit, so use the address field plus the title.
    expect(screen.getByText('Edit DeusPower')).toBeTruthy();
    expect(screen.getByLabelText('Address')).toBeTruthy();
  });

  it('“Add a lookup” opens the WIZARD, not the vendor form', async () => {
    const user = userEvent.setup();
    render(<CustomApiSection canManageVendors />);
    await waitFor(() => expect(screen.getByText('DeusPower')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Add a lookup' }));
    // ⛔ RED: swap the two handlers and this is the vendor form — it type-checks, and every other
    // suite still passes, because each dialog works perfectly on its own.
    expect(screen.getByText('Add a lookup', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByLabelText(/What should agents call this/i)).toBeTruthy();
  });

  it('⛔ a moderator gets the lookup wizard and NO vendor controls (D40)', async () => {
    const user = userEvent.setup();
    render(<CustomApiSection canManageVendors={false} />);
    await waitFor(() => expect(screen.getByText('DeusPower')).toBeTruthy());

    // The vendor half is not offered at all — not disabled, not present.
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'View lookups' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: 'Connect a system' })).toHaveLength(0);

    // POSITIVE CONTROL: the half they DO own still works, so this is D40 and not a blanket lockout.
    await user.click(screen.getByRole('button', { name: 'Add a lookup' }));
    expect(screen.getByLabelText(/What should agents call this/i)).toBeTruthy();
  });

  it('closing a dialog leaves the list, not a blank panel', async () => {
    const user = userEvent.setup();
    render(<CustomApiSection canManageVendors />);
    await waitFor(() => expect(screen.getByText('DeusPower')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Add a lookup' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText(/What should agents call this/i)).toBeNull();
    expect(screen.getByText('DeusPower')).toBeTruthy();
  });
});

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
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CustomApiSection } from '../CustomApiSection';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

const list = vi.fn<() => Promise<Connection[]>>();

// The dialogs drop the thread panel's cached availability after a save; this suite tests which
// dialog opens, not that, so the hook is stubbed rather than a QueryClient mounted for it.
vi.mock('@/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => () => {},
}));

vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));
vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: { ...actual.customApiService, list: () => list() },
  };
});

const connection = (): Connection => ({
  id: 1,
  name: 'Militech',
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

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}</output>;
};

/** The section now NAVIGATES for lookups (the editor is a page), so it needs a router. */
const renderSection = (canManageVendors: boolean) =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <CustomApiSection canManageVendors={canManageVendors} />
      <Where />
    </MemoryRouter>
  );

beforeEach(() => {
  list.mockReset().mockResolvedValue([connection()]);
});

describe('Settings › Integrations › Custom APIs — every button goes to the right screen', () => {
  it('“Manage” opens the VENDOR form', async () => {
    const user = userEvent.setup();
    renderSection(true);
    await waitFor(() => expect(screen.getByText('Militech')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Manage' }));
    // The vendor form, identified by something only it has: the D42 acknowledgement is absent on
    // an edit, so use the address field plus the title.
    expect(screen.getByText('Edit Militech')).toBeTruthy();
    expect(screen.getByLabelText('Address')).toBeTruthy();
  });

  it('“Add a lookup” opens the lookup editor PAGE, not the vendor form', async () => {
    const user = userEvent.setup();
    renderSection(true);
    await waitFor(() => expect(screen.getByText('Militech')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Add a lookup' }));
    // ⛔ RED: swap the two handlers and this is the vendor form — it type-checks, and every other
    // suite still passes, because each screen works perfectly on its own.
    expect(screen.getByTestId('where').textContent).toBe('/settings/custom-apis/1/lookups/new');
    expect(screen.queryByLabelText('Address')).toBeNull();
  });

  it('“Edit” on a lookup opens THAT lookup’s page', async () => {
    list.mockResolvedValue([
      {
        ...connection(),
        endpoints: [
          {
            id: 5,
            connectionId: 1,
            label: 'Customer account',
            path: '/customer?email={value}',
            method: 'GET',
            parameterSource: 'identity',
            identityField: 'email',
            sourceEndpointId: null,
            sourceFieldPath: null,
            ownershipSourceEndpointId: null,
            recordFormatPrefix: null,
            recordFormatLength: null,
            recordFormatCharset: null,
            headers: {},
            requestBodyTemplate: null,
            fieldPaths: [],
            resultShape: 'one',
            rowCap: 25,
            surface: 'both',
            category: null,
            statusLabels: {},
            seenStatuses: [],
            enabled: true,
            effectivelyEnabled: true,
            chainBroken: false,
            hasResponseSkeleton: false,
            skeletonSource: null,
            dataPath: null,
            templateKey: null,
            createdAt: '2026-09-19T10:00:00.000Z',
            updatedAt: '2026-09-19T10:00:00.000Z',
          },
        ],
      },
    ]);
    const user = userEvent.setup();
    renderSection(true);
    await waitFor(() => expect(screen.getByText('Customer account')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('where').textContent).toBe('/settings/custom-apis/1/lookups/5');
  });

  it('⛔ a moderator gets the lookup editor and NO vendor controls (D40)', async () => {
    const user = userEvent.setup();
    renderSection(false);
    await waitFor(() => expect(screen.getByText('Militech')).toBeTruthy());

    // The vendor half is not offered at all — not disabled, not present.
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'View lookups' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: 'Connect a system' })).toHaveLength(0);

    // POSITIVE CONTROL: the half they DO own still works, so this is D40 and not a blanket lockout.
    await user.click(screen.getByRole('button', { name: 'Add a lookup' }));
    expect(screen.getByTestId('where').textContent).toBe('/settings/custom-apis/1/lookups/new');
  });

  it('closing the vendor dialog leaves the list, not a blank panel', async () => {
    const user = userEvent.setup();
    renderSection(true);
    await waitFor(() => expect(screen.getByText('Militech')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Edit Militech')).toBeNull();
    expect(screen.getByText('Militech')).toBeTruthy();
  });
});

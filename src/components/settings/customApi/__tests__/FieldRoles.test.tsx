/**
 * CA-5 Task 4 — what the fields MEAN, asked in the client's words.
 *
 * The pure rules are tested directly (they are where the `find()`-order defect would live), and
 * the wizard is driven through the real Select so the wiring is covered too.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EndpointWizard } from '../EndpointWizard';
import { ROLE_OPTIONS, applyRole, fieldWithRole, roleOption } from '../fieldRoles';
import type * as Svc from '@/services/customApi.service';

type Connection = Svc.CustomApiConnection;

const createEndpoint = vi.fn<(connectionId: number, input: unknown) => Promise<Connection>>();
const updateEndpoint =
  vi.fn<(connectionId: number, endpointId: number, input: unknown) => Promise<Connection>>();
const sendTest =
  vi.fn<
    (
      connectionId: number,
      endpointId: number,
      parameter?: string
    ) => Promise<Svc.EndpointTestResult>
  >();

// The wizard drops the thread panel's cached availability after a save; that needs a
// QueryClient these tests do not mount, and what it invalidates is covered in EndpointWizard.test.
vi.mock('@/hooks/useCustomApiLookup', () => ({
  useInvalidateCustomApiAvailability: () => () => undefined,
}));

vi.mock('@/services/customApi.service', async () => {
  const actual = await vi.importActual<typeof Svc>('@/services/customApi.service');
  return {
    ...actual,
    customApiService: {
      ...actual.customApiService,
      createEndpoint: (connectionId: number, input: unknown) => createEndpoint(connectionId, input),
      updateEndpoint: (connectionId: number, endpointId: number, input: unknown) =>
        updateEndpoint(connectionId, endpointId, input),
      sendTest: (connectionId: number, endpointId: number, parameter?: string) =>
        sendTest(connectionId, endpointId, parameter),
    },
  };
});

const pick = (path: string, role: Svc.FieldPick['role'] = 'none'): Svc.FieldPick => ({
  path,
  label: path,
  kind: 'plain',
  role,
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

const withEndpoint = (): Connection => ({
  ...connection(),
  endpoints: [
    {
      id: 99,
      connectionId: 1,
      label: "This customer's orders",
      path: '/rest/order?email={value}',
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
      resultShape: 'many',
      rowCap: 25,
      surface: 'both',
      // L2: every endpoint that predates categories has none, which stays valid.
      category: null,
      // L2 P2: no vocabulary yet, which every lookup that predates it has.
      statusLabels: {},
      seenStatuses: [],
      enabled: true,
      effectivelyEnabled: true,
      chainBroken: false,
      hasResponseSkeleton: false,
      skeletonSource: null,
      dataPath: null,
      createdAt: '2026-09-19T10:00:00.000Z',
      updatedAt: '2026-09-19T10:00:00.000Z',
    },
  ],
});

const PATHS = ['order_id', 'status', 'date_added', 'total'];
const noop = () => {};

beforeEach(() => {
  createEndpoint.mockReset().mockResolvedValue(withEndpoint());
  updateEndpoint.mockReset().mockResolvedValue(withEndpoint());
  sendTest.mockReset().mockResolvedValue({ outcome: { status: 'ok' }, paths: PATHS });
});

describe('D45 — the customer-address role (support-service #789)', () => {
  it('is offered in the picker at all', () => {
    // ⛔ RED if the option is missing: the backend accepts the role, nothing can SET it, and #789
    // is latent — the blind scan keeps guessing on every existing integration with no remedy.
    const option = ROLE_OPTIONS.find((entry) => entry.value === 'customer_email');
    expect(option).toBeDefined();
    expect(option?.label).toMatch(/customer/i);
  });

  it('says what it buys in terms of the CHECK, not the field', () => {
    // The admin is being asked to tag a field for a privacy control. Copy that only describes the
    // field ("the email column") tells them nothing about why it matters.
    const option = ROLE_OPTIONS.find((entry) => entry.value === 'customer_email');
    expect(option?.buys).toMatch(/belongs to the customer/i);
    // ⛔ And it must be honest about the cost of NOT tagging — that is the whole argument for it.
    expect(option?.buys).toMatch(/guess/i);
  });

  it('obeys the one-field-per-role rule like every other tag', () => {
    // POSITIVE CONTROL that the new role is not special-cased anywhere: re-tagging MOVES it.
    const before = [pick('buyer_email', 'customer_email'), pick('contact_email')];
    const after = applyRole(before, 'contact_email', 'customer_email');
    expect(after.map((field) => field.role)).toEqual(['none', 'customer_email']);
    expect(fieldWithRole(after, 'customer_email')?.path).toBe('contact_email');
  });

  it('does not disturb a lookup that tags an identifier as well', () => {
    // The two roles coexist: ownership-by-number (D35) and ownership-by-address (D45) are
    // different doors and an admin may configure both.
    const before = [pick('order_id', 'identifier'), pick('buyer_email', 'customer_email')];
    const after = applyRole(before, 'buyer_email', 'customer_email');
    expect(fieldWithRole(after, 'identifier')?.path).toBe('order_id');
    expect(fieldWithRole(after, 'customer_email')?.path).toBe('buyer_email');
  });
});

describe('the rules — where an array-order bug would live', () => {
  it('⛔ at most ONE field per role: re-tagging MOVES the tag', () => {
    const before = [pick('order_id', 'identifier'), pick('reference')];
    const after = applyRole(before, 'reference', 'identifier');

    // ⛔ RED: just set the role on the target and both fields are `identifier`. The backend reads
    // a role with `find()`, so the ownership check would silently depend on ARRAY ORDER — it
    // would work, then stop working when the admin re-ordered their picks.
    expect(after.map((field) => field.role)).toEqual(['none', 'identifier']);
    expect(fieldWithRole(after, 'identifier')?.path).toBe('reference');
  });

  it('untagging one field leaves the others alone', () => {
    const before = [pick('order_id', 'identifier'), pick('status', 'status')];
    const after = applyRole(before, 'order_id', 'none');
    // POSITIVE CONTROL for the rule above: `none` is exempt, so clearing one tag must not sweep
    // every other tag off the lookup.
    expect(fieldWithRole(after, 'identifier')).toBeUndefined();
    expect(fieldWithRole(after, 'status')?.path).toBe('status');
  });

  it('every role says what it BUYS, except "just show it" which buys nothing', () => {
    for (const option of ROLE_OPTIONS) {
      if (option.value === 'none') expect(option.buys).toBe('');
      // ⛔ RED: ship a role with no explanation and the admin sees what to do and never why.
      else expect(option.buys.length).toBeGreaterThan(20);
    }
  });

  it("⛔ speaks the client's language, not the contract's", () => {
    const labels = ROLE_OPTIONS.map((option) => option.label.toLowerCase()).join(' ');
    // RED: label these `identifier` / `total` / `currency` and we have exported our data model as
    // a form — an admin configuring their shop has never heard any of those words.
    for (const ours of ['identifier', 'role', 'field path']) expect(labels).not.toContain(ours);
    expect(roleOption('identifier').label).toMatch(/number the customer quotes/i);
  });
});

describe('in the wizard', () => {
  const openWithField = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<EndpointWizard connection={connection()} onClose={noop} onSaved={noop} />);
    await user.type(screen.getByLabelText(/What should agents call this/i), 'Orders');
    await user.type(screen.getByLabelText(/Address in your system/i), '/rest/order?email=');
    await user.paste('{value}');
    await user.click(screen.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(PATHS.length));
  };

  it('⛔ each role control is named for ITS field, not "What is this?" (audit pass 4)', async () => {
    const user = userEvent.setup();
    await openWithField(user);
    await user.click(screen.getByRole('checkbox', { name: /order_id/ }));
    await user.click(screen.getByRole('checkbox', { name: /^status/ }));

    // RED: label them all "What is this?" and two controls share one accessible name — the
    // identical defect fixed for the label input in the previous audit, recurring in new code.
    expect(screen.getByLabelText('What is order_id?')).toBeTruthy();
    expect(screen.getByLabelText('What is status?')).toBeTruthy();

    /*
     * ⛔ THE CLASS, NOT THE CONTROL. "Kind" and "Its currency" had the same defect and came from
     * the PREVIOUS PR — audited twenty-one times and missed, because every pass asked about
     * behaviour and none asked whether two controls could answer to one name. Merged is not
     * audited.
     */
    expect(screen.getByLabelText('How to show order_id')).toBeTruthy();
    expect(screen.getByLabelText('How to show status')).toBeTruthy();
  });

  it('⛔ D45: the customer-address role is SELECTABLE and reaches the save payload', async () => {
    const user = userEvent.setup();
    await openWithField(user);
    await user.click(screen.getByRole('checkbox', { name: /order_id/ }));

    // ⛔ WIRING, NOT THE ARRAY. Asserting ROLE_OPTIONS contains the role proves the list; it does
    // not prove an admin can pick it or that the value survives to the request. A typo in the
    // option value ships green against a list-only test. This selects it in the real control and
    // reads the payload the service was called with.
    await user.selectOptions(screen.getByLabelText('What is order_id?'), 'customer_email');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const saved = updateEndpoint.mock.calls.at(-1)?.[2] as { fieldPaths: Svc.FieldPick[] };
    expect(saved.fieldPaths.find((field) => field.path === 'order_id')?.role).toBe(
      'customer_email'
    );
  });

  it('the admin is told what tagging it BUYS, in the wizard itself', async () => {
    const user = userEvent.setup();
    await openWithField(user);
    await user.click(screen.getByRole('checkbox', { name: /order_id/ }));
    await user.selectOptions(screen.getByLabelText('What is order_id?'), 'customer_email');

    // ⛔ The most important privacy control in the product must not be configured by accident.
    // RED: render the picker without `buys` and the admin sees what to do and never why.
    await waitFor(() =>
      expect(screen.getByText(/belongs to the customer who wrote in/i)).toBeTruthy()
    );
  });

  it('⛔ TAGGING IS OPTIONAL — a lookup saves and works with nothing tagged', async () => {
    const user = userEvent.setup();
    await openWithField(user);
    await user.click(screen.getByRole('checkbox', { name: /^status/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // ⛔ RED: require a role to save and an admin cannot reach a working lookup without
    // understanding a concept they do not need yet. Fields alone already show data.
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const saved = updateEndpoint.mock.calls.at(-1)?.[2] as { fieldPaths: Svc.FieldPick[] };
    expect(saved.fieldPaths).toEqual([
      { path: 'status', label: 'Status', kind: 'plain', role: 'none' },
    ]);
  });

  it('tags a field, and tells the admin what that tag buys', async () => {
    const user = userEvent.setup();
    await openWithField(user);
    await user.click(screen.getByRole('checkbox', { name: /order_id/ }));
    await user.selectOptions(screen.getByLabelText('What is order_id?'), 'identifier');

    expect(screen.getByText(/really belongs to the customer who wrote in/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const saved = updateEndpoint.mock.calls.at(-1)?.[2] as { fieldPaths: Svc.FieldPick[] };
    expect(saved.fieldPaths[0]).toMatchObject({ path: 'order_id', role: 'identifier' });
  });

  it('⛔ moving a tag to a second field leaves only ONE identifier on the saved lookup', async () => {
    const user = userEvent.setup();
    await openWithField(user);
    await user.click(screen.getByRole('checkbox', { name: /order_id/ }));
    await user.click(screen.getByRole('checkbox', { name: /^status/ }));

    /*
     * ⛔ Addressed BY FIELD, which is only possible because each select is named for its own
     * field (audit pass 4). With five picked fields all called "What is this?", neither a test
     * nor a screen-reader user can tell them apart.
     */
    await user.selectOptions(screen.getByLabelText('What is order_id?'), 'identifier');
    await user.selectOptions(screen.getByLabelText('What is status?'), 'identifier');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateEndpoint).toHaveBeenCalled());
    const saved = updateEndpoint.mock.calls.at(-1)?.[2] as { fieldPaths: Svc.FieldPick[] };
    const identifiers = saved.fieldPaths.filter((field) => field.role === 'identifier');
    // RED: allow two and the ownership check depends on which one `find()` reaches first.
    expect(identifiers).toHaveLength(1);
    expect(identifiers[0].path).toBe('status');
  });
});

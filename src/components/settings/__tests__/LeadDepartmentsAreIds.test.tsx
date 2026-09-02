/**
 * The lead opt-in is a list of department IDS, and this page is the only thing that writes it.
 *
 * It used to write SLUGS while the backend gate compared them against a numeric
 * `conversations.departmentId`. `['sales'].includes(57)` is false, so lead qualification never
 * ran — measured on prod 2026-09-02 as `is_lead` true on **0 of 8,363** conversations, with a
 * client's Sales department opted in the whole time and the Speed-to-Lead report sitting on
 * top of it. (support-service#623)
 *
 * Two properties are pinned here, and the second is the one a refactor would quietly drop:
 *   1. toggling a department writes its **id**;
 *   2. a row still holding the legacy **slug** renders as CHECKED. A workspace can open this
 *      page after the new UI ships and before its row is migrated; an unchecked box invites
 *      the operator to "fix" it by saving, which would wipe an opt-in they still have.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadQualificationSettings } from '../LeadQualificationSettings';

// Typed parameter, not `vi.fn(() => …)`: with no parameter vitest infers a ZERO-arg mock, so
// the call below is a 1-arg call on a 0-arg signature and `mock.calls` types as the empty
// tuple `[]` — which makes `calls[0][0]` a type error rather than a runtime one.
const updateLeadConfig = vi.fn((_data: unknown) => Promise.resolve({}));
let storedDepartments: (number | string)[] = [];

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getLeadConfig: () =>
      Promise.resolve({
        departments: storedDepartments,
        requiredContactFields: ['name', 'email'],
        autoMarkNewSenders: false,
        qualificationFields: [],
        categories: [],
      }),
    updateLeadConfig: (data: unknown) => updateLeadConfig(data as never),
  },
}));

vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 57, slug: 'sales', name: 'Sales', active: true },
      { id: 58, slug: 'support', name: 'Support', active: true },
      { id: 59, slug: 'retired', name: 'Retired', active: false },
    ],
  }),
}));

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LeadQualificationSettings />
    </QueryClientProvider>
  );
};

afterEach(() => {
  cleanup();
  updateLeadConfig.mockClear();
  storedDepartments = [];
});

describe('the lead department opt-in', () => {
  it('lists active departments by NAME and leaves inactive ones out', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sales')).toBeInTheDocument());
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.queryByText('Retired')).not.toBeInTheDocument();
  });

  it('shows a department stored as an ID as checked', async () => {
    storedDepartments = [57];
    renderPage();

    const sales = await screen.findByRole('checkbox', { name: /Sales/i });
    await waitFor(() => expect(sales).toBeChecked());
  });

  it('shows a department stored as a legacy SLUG as checked — an unmigrated row is not "off"', async () => {
    storedDepartments = ['sales'];
    renderPage();

    const sales = await screen.findByRole('checkbox', { name: /Sales/i });
    await waitFor(() => expect(sales).toBeChecked());
  });

  it('writes an id when a department is enabled', async () => {
    renderPage();
    const support = await screen.findByRole('checkbox', { name: /Support/i });
    fireEvent.click(support);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(updateLeadConfig).toHaveBeenCalled());
    const sent = updateLeadConfig.mock.calls[0][0] as { departments: unknown[] };
    expect(sent.departments).toContain(58);
    expect(sent.departments).not.toContain('support');
  });

  it('replaces a legacy slug with the id rather than storing both', async () => {
    // Toggling a slug-stored department off and on again must not leave `['sales', 57]`
    // behind — two entries for one department is how the ambiguity came back.
    storedDepartments = ['sales'];
    renderPage();

    const sales = await screen.findByRole('checkbox', { name: /Sales/i });
    await waitFor(() => expect(sales).toBeChecked());
    fireEvent.click(sales); // off — drops the slug
    fireEvent.click(sales); // on  — writes the id

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(updateLeadConfig).toHaveBeenCalled());
    const sent = updateLeadConfig.mock.calls[0][0] as { departments: unknown[] };
    expect(sent.departments).toEqual([57]);
  });
});

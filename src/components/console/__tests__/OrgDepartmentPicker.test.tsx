import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { OrgDepartmentPicker } from '@/components/console/OrgDepartmentPicker';

// The picker's only data source is useOrgDepartments; mock it so these are pure
// component tests (render + toggle wiring), no react-query / network.
vi.mock('@/hooks/useAllianceGroups', () => ({ useOrgDepartments: vi.fn() }));
import { useOrgDepartments } from '@/hooks/useAllianceGroups';

const mockHook = useOrgDepartments as unknown as ReturnType<typeof vi.fn>;
const withDepartments = (data: Array<{ id: number; name: string }>, isLoading = false) =>
  mockHook.mockReturnValue({ data, isLoading });

const switchFor = (name: string): HTMLButtonElement =>
  screen.getByText(name).closest('label')!.querySelector('[role="switch"]') as HTMLButtonElement;

/** The picker is collapsed by default, so open it before asserting on its contents. */
const disclosure = (): HTMLElement => screen.getByRole('button', { name: /departments/i });

const renderOpen = (ui: React.ReactElement) => {
  const result = render(ui);
  fireEvent.click(disclosure());
  return result;
};

afterEach(() => {
  cleanup();
  mockHook.mockReset();
});

const DEPTS = [
  { id: 3, name: 'Sales' },
  { id: 4, name: 'Billing' },
];

describe('OrgDepartmentPicker — collapsed by default', () => {
  // Scoping a group to departments is the exception; the usual answer is "leave it
  // empty for the role default". Opening a row of toggles on every workspace made that
  // rare decision compete with the common ones (which role, which workspace), so this
  // matches PermissionOverridesSection's "Customize permissions" disclosure.
  it('hides the toggles until the disclosure is opened', () => {
    withDepartments(DEPTS);
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(screen.queryByRole('switch')).toBeNull();
    // The workspace is still named while collapsed — the label IS the disclosure.
    expect(disclosure()).toHaveTextContent(/Acme — departments/);
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens and closes on click', () => {
    withDepartments(DEPTS);
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    fireEvent.click(disclosure());
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(disclosure());
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('⛔ collapsing must hide the CONTROL, never the STATE — a scoped group says so while collapsed', () => {
    withDepartments(DEPTS);
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[3, 4]} onChange={vi.fn()} />
    );

    // Without this badge, an admin editing an already-scoped group would see a closed
    // section and reasonably conclude the group had no department restrictions at all.
    expect(disclosure()).toHaveTextContent('2');
  });

  it('shows no badge when nothing is selected, so "empty" is not dressed up as a setting', () => {
    withDepartments(DEPTS);
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(disclosure()).not.toHaveTextContent(/\d/);
  });
});

describe('OrgDepartmentPicker', () => {
  it('renders each department, reflecting which are selected via aria-checked', () => {
    withDepartments(DEPTS);
    renderOpen(
      <OrgDepartmentPicker
        allianceId={7}
        orgId={42}
        orgLabel="Acme"
        selected={[3]}
        onChange={vi.fn()}
      />
    );

    // Sales is selected...
    expect(switchFor('Sales')).toHaveAttribute('aria-checked', 'true');
    // ...Billing is the control that must NOT be.
    expect(switchFor('Billing')).toHaveAttribute('aria-checked', 'false');
  });

  it('adds a department to the selection when an unchecked one is toggled', () => {
    withDepartments(DEPTS);
    const onChange = vi.fn();
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[3]} onChange={onChange} />
    );

    fireEvent.click(switchFor('Billing'));
    // Appended, not replaced — the already-selected Sales survives.
    expect(onChange).toHaveBeenCalledWith([3, 4]);
  });

  it('removes a department from the selection when a checked one is toggled off', () => {
    withDepartments(DEPTS);
    const onChange = vi.fn();
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[3, 4]} onChange={onChange} />
    );

    fireEvent.click(switchFor('Sales'));
    expect(onChange).toHaveBeenCalledWith([4]);
  });

  it('shows the role-default hint (no toggles) when the org has no departments', () => {
    withDepartments([]);
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(screen.getByText(/members get the role default/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows a loading affordance and no toggles while departments are loading', () => {
    withDepartments([], true);
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(screen.getByText(/loading departments/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('disables the toggles and blocks changes when disabled', () => {
    withDepartments(DEPTS);
    const onChange = vi.fn();
    renderOpen(
      <OrgDepartmentPicker
        allianceId={7}
        orgId={42}
        orgLabel="Acme"
        selected={[3]}
        onChange={onChange}
        disabled
      />
    );

    expect(switchFor('Sales')).toBeDisabled();
    fireEvent.click(switchFor('Billing'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

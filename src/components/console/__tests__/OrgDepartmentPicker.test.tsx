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

afterEach(() => {
  cleanup();
  mockHook.mockReset();
});

const DEPTS = [
  { id: 3, name: 'Sales' },
  { id: 4, name: 'Billing' },
];

describe('OrgDepartmentPicker', () => {
  it('renders each department, reflecting which are selected via aria-checked', () => {
    withDepartments(DEPTS);
    render(
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
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[3]} onChange={onChange} />
    );

    fireEvent.click(switchFor('Billing'));
    // Appended, not replaced — the already-selected Sales survives.
    expect(onChange).toHaveBeenCalledWith([3, 4]);
  });

  it('removes a department from the selection when a checked one is toggled off', () => {
    withDepartments(DEPTS);
    const onChange = vi.fn();
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[3, 4]} onChange={onChange} />
    );

    fireEvent.click(switchFor('Sales'));
    expect(onChange).toHaveBeenCalledWith([4]);
  });

  it('shows the role-default hint (no toggles) when the org has no departments', () => {
    withDepartments([]);
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(screen.getByText(/members get the role default/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows a loading affordance and no toggles while departments are loading', () => {
    withDepartments([], true);
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(screen.getByText(/loading departments/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('disables the toggles and blocks changes when disabled', () => {
    withDepartments(DEPTS);
    const onChange = vi.fn();
    render(
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

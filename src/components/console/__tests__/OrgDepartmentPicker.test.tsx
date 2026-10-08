import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { OrgDepartmentPicker } from '@/components/console/OrgDepartmentPicker';
import { chooseOption, listOptions } from '@/test/chooseOption';

// The picker's only data source is useOrgDepartments; mock it so these are pure
// component tests (render + toggle wiring), no react-query / network.
vi.mock('@/hooks/useAllianceGroups', () => ({ useOrgDepartments: vi.fn() }));
import { useOrgDepartments } from '@/hooks/useAllianceGroups';

const mockHook = useOrgDepartments as unknown as ReturnType<typeof vi.fn>;
const withDepartments = (data: Array<{ id: number; name: string }>, isLoading = false) =>
  mockHook.mockReturnValue({ data, isLoading });

/** The department Select inside the opened disclosure. */
const picker = (): HTMLElement => screen.getByRole('combobox', { name: 'Acme — departments' });

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
  it('hides the department picker until the disclosure is opened', () => {
    withDepartments(DEPTS);
    render(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(screen.queryByRole('combobox')).toBeNull();
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
    expect(picker()).toBeInTheDocument();
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(disclosure());
    expect(screen.queryByRole('combobox')).toBeNull();
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
  it('offers each department and shows which are selected', async () => {
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

    // Sales is selected (its chip and its remove control)...
    expect(screen.getByRole('button', { name: 'Remove Sales' })).toBeInTheDocument();
    // ...Billing is the control that must NOT be.
    expect(screen.queryByRole('button', { name: 'Remove Billing' })).toBeNull();
    expect(await listOptions(picker())).toEqual(['Sales', 'Billing']);
  });

  it('adds a department to the selection when an unticked one is chosen', async () => {
    withDepartments(DEPTS);
    const onChange = vi.fn();
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[3]} onChange={onChange} />
    );

    await chooseOption(picker(), 'Billing');
    // Appended, not replaced — the already-selected Sales survives.
    expect(onChange).toHaveBeenCalledWith([3, 4]);
  });

  it('removes a department from the selection when its chip is removed', () => {
    withDepartments(DEPTS);
    const onChange = vi.fn();
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[3, 4]} onChange={onChange} />
    );

    // react-select acts on mousedown for the chip's remove control.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Remove Sales' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sales' }));
    expect(onChange).toHaveBeenLastCalledWith([4]);
  });

  it('keeps a mapped id this org does not list when another department is chosen', async () => {
    withDepartments(DEPTS);
    const onChange = vi.fn();
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[3, 99]} onChange={onChange} />
    );

    await chooseOption(picker(), 'Billing');
    // 99 is not offered here, so the Select cannot show it — the tick must not drop it.
    expect(onChange).toHaveBeenCalledWith([3, 99, 4]);
  });

  it('shows the role-default hint (no picker) when the org has no departments', () => {
    withDepartments([]);
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(screen.getByText(/members get the role default/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows a loading affordance and no picker while departments are loading', () => {
    withDepartments([], true);
    renderOpen(
      <OrgDepartmentPicker allianceId={7} orgId={42} orgLabel="Acme" selected={[]} onChange={vi.fn()} />
    );

    expect(screen.getByText(/loading departments/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('disables the picker and blocks changes when disabled', () => {
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

    expect(picker()).toBeDisabled();
    fireEvent.keyDown(picker(), { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
    expect(screen.queryByRole('option', { name: 'Billing' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

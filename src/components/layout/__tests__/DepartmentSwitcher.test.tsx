import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DepartmentSwitcher } from '@/components/layout/DepartmentSwitcher';
import { useAuthStore } from '@/stores/authStore';
import { useDepartmentContextStore } from '@/stores/departmentContextStore';
import type { Department, User } from '@/types';

// The switcher's only network dependency is useDepartments; mock it and drive the
// zustand stores directly so these stay pure component tests.
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: vi.fn() }));
import { useDepartments } from '@/hooks/useDepartments';

const mockDepartments = useDepartments as unknown as ReturnType<typeof vi.fn>;

const dept = (id: number, name: string, hasMessageSource: boolean): Department => ({
  id,
  name,
  slug: name.toLowerCase(),
  description: null,
  color: null,
  active: true,
  isDefault: false,
  hasMessageSource,
  kbOnly: !hasMessageSource,
});

const withDepartments = (data: Department[], isLoading = false) =>
  mockDepartments.mockReturnValue({ data, isLoading });

const signIn = (departmentIds: number[]) => {
  useAuthStore.setState({
    user: {
      id: 1,
      email: 'agent@example.com',
      firstName: 'Ada',
      lastName: null,
      position: null,
      role: 'user',
      departmentIds,
      createdAt: '2026-01-01T00:00:00.000Z',
    } as User,
    selectedOrganizationId: 42,
  });
};

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /departments?$/i }));

beforeEach(() => {
  useDepartmentContextStore.setState({ _selectedByKey: {} });
});

afterEach(() => {
  cleanup();
  mockDepartments.mockReset();
  useAuthStore.setState({ user: null, selectedOrganizationId: null });
});

describe('DepartmentSwitcher', () => {
  it('lists only departments a message source serves', () => {
    withDepartments([dept(3, 'Sales', true), dept(4, 'Billing', false), dept(5, 'Support', true)]);
    signIn([3, 4, 5]);

    render(<DepartmentSwitcher />);
    openMenu();

    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
    // Billing has no message source — it can never receive a ticket, so it is not offered
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  // The regression this file exists for: source-reachability filtering must narrow the
  // LIST, never unmount the control. Before the fix the guard ran on the filtered list,
  // so an org with one served department lost the switcher entirely.
  it('stays mounted when fewer than two departments are served', () => {
    withDepartments([dept(3, 'Sales', true), dept(4, 'Billing', false)]);
    signIn([3, 4]);

    render(<DepartmentSwitcher />);

    expect(screen.getByText('All departments')).toBeInTheDocument();
  });

  it('explains the empty list when no department is served at all', () => {
    withDepartments([dept(3, 'Sales', false), dept(4, 'Billing', false)]);
    signIn([3, 4]);

    render(<DepartmentSwitcher />);
    openMenu();

    expect(screen.getByText(/No department is served by a message channel yet/i)).toBeInTheDocument();
    expect(screen.queryByText('Sales')).not.toBeInTheDocument();
  });

  // Control: the multi-department gate itself must survive the fix. A user with a single
  // accessible department has nothing to filter, so the switcher stays hidden.
  it('renders nothing for a single-department user', () => {
    withDepartments([dept(3, 'Sales', true), dept(4, 'Billing', true)]);
    signIn([3]);

    const { container } = render(<DepartmentSwitcher />);

    expect(container).toBeEmptyDOMElement();
  });

  // Control: still hidden while the department list is in flight.
  it('renders nothing while departments are loading', () => {
    withDepartments([], true);
    signIn([3, 4]);

    const { container } = render(<DepartmentSwitcher />);

    expect(container).toBeEmptyDOMElement();
  });

  it('checking every offered department collapses back to "All"', () => {
    withDepartments([dept(3, 'Sales', true), dept(4, 'Billing', false), dept(5, 'Support', true)]);
    signIn([3, 4, 5]);

    render(<DepartmentSwitcher />);
    openMenu();

    fireEvent.click(screen.getByText('Sales'));
    expect(useDepartmentContextStore.getState().getSelectedDeptIds()).toEqual([3]);

    // Checking the only other offered department means "no filter" — unserved Billing
    // is not selectable, so the accessible count (3) is unreachable and must not gate this.
    fireEvent.click(screen.getByText('Support'));
    expect(useDepartmentContextStore.getState().getSelectedDeptIds()).toEqual([]);
  });
});

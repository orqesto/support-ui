/**
 * Teams switched off ⇒ no team switcher, badge or filter. Each case renders the same piece with
 * teams on (CONTROL: it shows) and off (it is gone), driven only by the list response's
 * `teamsEnabled`, with the same two active teams both times — so the flag, not the count,
 * decides.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, renderHook } from '@testing-library/react';
import type { Department, User } from '@/types';

const state = vi.hoisted(() => ({ teamsEnabled: true as boolean | undefined }));

const team = (id: number, name: string): Department => ({
  id,
  name,
  slug: name.toLowerCase(),
  description: null,
  color: '#3366ff',
  active: true,
  isDefault: id === 1,
  hasMessageSource: true,
});
const TEAMS = [team(1, 'General'), team(2, 'Sales')];

vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: TEAMS, isLoading: false, teamsEnabled: state.teamsEnabled }),
  useDepartmentById: (id: number | null | undefined) => TEAMS.find((one) => one.id === id),
}));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => false }),
}));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: { getAssignableUsers: () => Promise.resolve([]) },
}));
vi.mock('@/services/messageSourceOptions.service', () => ({
  getMessageSourceOptions: () => Promise.resolve([]),
}));
vi.mock('@/services/message.service', () => ({
  messageService: {
    getAliasOptions: () => Promise.resolve([]),
    getReceivedAtOptions: () => Promise.resolve([]),
  },
}));

const { default: DepartmentBadge } = await import('@/components/admin/DepartmentBadge');
const { DepartmentSwitcher } = await import('@/components/layout/DepartmentSwitcher');
const { useFilterOptions } = await import('@/components/messages/filters/useFilterOptions');
const { useAuthStore } = await import('@/stores/authStore');
const { useDepartmentContextStore } = await import('@/stores/departmentContextStore');

beforeEach(() => {
  state.teamsEnabled = true;
  useDepartmentContextStore.setState({ _selectedByKey: {} });
  useAuthStore.setState({
    user: { id: 1, email: 'agent@example.com', role: 'user', departmentIds: [1, 2] } as User,
    selectedOrganizationId: 42,
  });
});
afterEach(cleanup);

describe('teams off hides team UI', () => {
  it('team badge: shown on, gone off', () => {
    const { unmount } = render(<DepartmentBadge departmentId={2} />);
    expect(screen.getByText('Sales')).toBeTruthy();
    unmount();
    state.teamsEnabled = false;
    render(<DepartmentBadge departmentId={2} />);
    expect(screen.queryByText('Sales')).toBeNull();
  });

  it('the baseline badge (rules for every team) is gone too', () => {
    state.teamsEnabled = false;
    render(<DepartmentBadge departmentId={null} nullVariant="baseline" />);
    expect(screen.queryByText('Baseline')).toBeNull();
  });

  it('team switcher: shown on, gone off', () => {
    const { unmount } = render(<DepartmentSwitcher />);
    expect(screen.getByText('All teams')).toBeTruthy();
    unmount();
    state.teamsEnabled = false;
    render(<DepartmentSwitcher />);
    expect(screen.queryByText('All teams')).toBeNull();
  });

  it('a remembered team pick is dropped when teams are off, so it cannot narrow the inbox', () => {
    useDepartmentContextStore.getState().setSelected([2]);
    expect(useDepartmentContextStore.getState().getSelectedDeptIds()).toEqual([2]);
    state.teamsEnabled = false;
    render(<DepartmentSwitcher />);
    expect(useDepartmentContextStore.getState().getSelectedDeptIds()).toEqual([]);
  });

  it('inbox Team filter: options on, none off (the schema then drops the filter)', () => {
    const on = renderHook(() => useFilterOptions());
    expect(on.result.current.departments.map((option) => option.label)).toContain('Sales');
    on.unmount();
    state.teamsEnabled = false;
    const off = renderHook(() => useFilterOptions());
    expect(off.result.current.departments).toEqual([]);
  });
});

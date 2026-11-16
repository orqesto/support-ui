/** SLA Thresholds: workspace admins and moderators see and change it (owner, 2026-11-16); an agent does not. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Permission, rolePermissions } from '@/types/roles';

let perms = { isAdmin: false, isOrgAdmin: false, hasPermission: (_p: string) => false };
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => perms }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
for (const name of [
  'WorkspaceDetailsSettings',
  'CategoriesSettings',
  'LabelsSettings',
  'RoutingKeysSettings',
  'SLAConfigSettings',
  'BusinessHoursSettings',
  'OpenConversationWindowSettings',
  'SecuritySettings',
  'WorkspaceAiUsage',
]) {
  vi.doMock(`../${name}`, () => ({ [name]: () => <div>{name}</div> }));
}

const { OrganizationSettings } = await import('../OrganizationSettings');

const asRole = (role: 'moderator' | 'support') => {
  const held = rolePermissions[role] as string[];
  perms = { isAdmin: false, isOrgAdmin: false, hasPermission: (perm: string) => held.includes(perm) };
};

beforeEach(() => {
  perms = { isAdmin: false, isOrgAdmin: false, hasPermission: () => false };
});
afterEach(cleanup);

describe('Workspace settings: SLA Thresholds tab', () => {
  it('opens for a moderator, including from a deep link', () => {
    asRole('moderator');
    render(<OrganizationSettings section="sla-config" />);
    expect(screen.getByText('SLA Thresholds')).toBeInTheDocument();
    expect(screen.getByText('SLAConfigSettings')).toBeInTheDocument();
  });

  it('is not offered to an agent, and a deep link falls back to another tab', () => {
    asRole('support');
    render(<OrganizationSettings section="sla-config" />);
    expect(screen.queryByText('SLA Thresholds')).toBeNull();
    expect(screen.queryByText('SLAConfigSettings')).toBeNull();
  });

  it('the moderator still does not get Business Hours or Authentication', () => {
    asRole('moderator');
    render(<OrganizationSettings />);
    expect(screen.queryByText('Business Hours')).toBeNull();
    expect(screen.queryByText('Authentication')).toBeNull();
  });

  it('MANAGE_SLA_CONFIG is held by org admin and moderator, not support or associate', () => {
    expect(rolePermissions.org_admin).toContain(Permission.MANAGE_SLA_CONFIG);
    expect(rolePermissions.moderator).toContain(Permission.MANAGE_SLA_CONFIG);
    expect(rolePermissions.support).not.toContain(Permission.MANAGE_SLA_CONFIG);
    expect(rolePermissions.associate).not.toContain(Permission.MANAGE_SLA_CONFIG);
  });
});

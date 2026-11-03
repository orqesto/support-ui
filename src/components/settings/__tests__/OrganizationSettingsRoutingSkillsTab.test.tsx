/**
 * Routing Skills is all editing and every call needs manage_routing_rules: admins and moderators
 * see it; a support agent does not (staging 2026-11-03: the agent saw every control, got 403 on
 * each, and read a false "No routing keys defined yet").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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
  'AutomaticReplySubjectsSettings',
  'SecuritySettings',
  'WorkspaceAiUsage',
]) {
  vi.doMock(`../${name}`, () => ({ [name]: () => <div>{name}</div> }));
}

const { OrganizationSettings } = await import('../OrganizationSettings');

beforeEach(() => {
  perms = { isAdmin: false, isOrgAdmin: false, hasPermission: () => false };
});
afterEach(cleanup);

describe('Workspace settings: Routing Skills tab', () => {
  it('is not offered to a support agent, and a deep link falls back to Categories', () => {
    render(<OrganizationSettings section="routing-skills" />);
    expect(screen.queryByText('Routing Skills')).toBeNull();
    expect(screen.queryByText('RoutingKeysSettings')).toBeNull();
    expect(screen.getByText('CategoriesSettings')).toBeInTheDocument();
  });

  it('is offered to a moderator (manage_routing_rules)', () => {
    perms = {
      isAdmin: false,
      isOrgAdmin: false,
      hasPermission: (perm: string) => perm === 'manage_routing_rules',
    };
    render(<OrganizationSettings section="routing-skills" />);
    expect(screen.getByText('Routing Skills')).toBeInTheDocument();
    expect(screen.getByText('RoutingKeysSettings')).toBeInTheDocument();
  });

  it('is offered to a global admin even without the permission flag', () => {
    perms = { isAdmin: true, isOrgAdmin: false, hasPermission: () => false };
    render(<OrganizationSettings section="routing-skills" />);
    expect(screen.getByText('RoutingKeysSettings')).toBeInTheDocument();
  });
});

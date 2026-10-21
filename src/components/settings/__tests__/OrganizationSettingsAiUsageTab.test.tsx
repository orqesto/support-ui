/** The AI usage tab is all money (≈ $): workspace and platform admins see it; an agent does not. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

let perms = { isAdmin: false, isOrgAdmin: false };
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

beforeEach(() => {
  perms = { isAdmin: false, isOrgAdmin: false };
});
afterEach(cleanup);

describe('Workspace settings: AI usage tab', () => {
  it('is not offered to an agent, and a deep link falls back to another tab', () => {
    render(<OrganizationSettings section="ai-usage" />);
    expect(screen.queryByText('AI usage')).toBeNull();
    expect(screen.queryByText('WorkspaceAiUsage')).toBeNull();
  });

  it('is offered to a workspace admin', () => {
    perms = { isAdmin: false, isOrgAdmin: true };
    render(<OrganizationSettings section="ai-usage" />);
    expect(screen.getByText('AI usage')).toBeInTheDocument();
  });
});

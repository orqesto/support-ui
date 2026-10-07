/** The KB repair section lives on Settings → System, behind the same global-admin guard. */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let isAdmin = true;
vi.mock('@/services/system.service', () => ({ default: {} }));
vi.mock('@/components/ui/ReactSelect', () => ({ ReactSelect: () => <div /> }));
// The captured-question block (2026-10-07) lists workspaces on mount — never a real request.
vi.mock('@/services/organization.service', () => ({
  organizationService: { getAllPages: () => new Promise(() => undefined) },
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin }) }));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: () => undefined }),
}));

const { SystemManagementSettings } = await import('../SystemManagementSettings');
afterEach(cleanup);

describe('Settings → System — knowledge base repair', () => {
  it('is on the page for a global admin', () => {
    isAdmin = true;
    render(<SystemManagementSettings />);
    expect(screen.getByText('Knowledge base repair')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Check$/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Show mailboxes/ })).toBeInTheDocument();
    expect(screen.getByText('Bounce repair')).toBeInTheDocument();
  });

  it('is not shown to anyone else', () => {
    isAdmin = false;
    render(<SystemManagementSettings />);
    expect(screen.queryByText('Knowledge base repair')).not.toBeInTheDocument();
    expect(screen.queryByText('Bounce repair')).not.toBeInTheDocument();
    expect(screen.getByText(/Access Denied/)).toBeInTheDocument();
  });
});

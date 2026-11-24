/**
 * Role wording (settings quick wins, Task 7): `org_admin` reads "Workspace admin" and `associate`
 * "Light agent". Labels only — the stored values are unchanged. Invented data.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: null; selectedOrganizationId: number }) => unknown) =>
    selector({ user: null, selectedOrganizationId: 2 }),
}));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => Promise.resolve([]) },
}));

const { CreateUserModal } = await import('../CreateUserModal');
const { SCIM_ROLE_OPTIONS } = await import('../../SCIMConfigSettings');
const { ORG_ROLE_OPTIONS, roleDisplayNames } = await import('@/types/roles');

afterEach(cleanup);

describe('role wording', () => {
  it('the display names', () => {
    expect(roleDisplayNames.org_admin).toBe('Workspace admin');
    expect(roleDisplayNames.associate).toBe('Light agent');
  });

  it('the workspace role options keep their stored values', () => {
    expect(ORG_ROLE_OPTIONS).toEqual([
      { value: 'org_admin', label: 'Workspace admin' },
      { value: 'moderator', label: 'Moderator' },
      { value: 'support', label: 'Support Agent' },
      { value: 'associate', label: 'Light agent' },
    ]);
  });

  it('the SCIM role picker says the same, values unchanged', () => {
    expect(SCIM_ROLE_OPTIONS).toContainEqual({ value: 'org_admin', label: 'Workspace admin' });
    expect(SCIM_ROLE_OPTIONS).toContainEqual({ value: 'associate', label: 'Light agent' });
    expect(SCIM_ROLE_OPTIONS[0]).toEqual({ value: '', label: '— no role —' });
  });

  it('the create-user modal offers "Workspace admin" and "Light agent"', () => {
    render(
      <ThemeProvider>
        <CreateUserModal isOpen onClose={vi.fn()} onCreate={vi.fn()} />
      </ThemeProvider>
    );
    fireEvent.keyDown(screen.getByLabelText('Workspace Role'), {
      key: 'ArrowDown',
      code: 'ArrowDown',
    });
    expect(screen.getByRole('option', { name: 'Workspace admin' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Light agent' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Associate' })).toBeNull();
  });
});

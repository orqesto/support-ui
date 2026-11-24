/**
 * The console's workspace edit dialog showed "Inactive" for a live workspace, and Save always
 * sent the switch's value — so saving a rename with a wrongly seeded switch would have turned
 * the workspace off. The status is now sent only when the operator flips it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Organization } from '@/services/organization.service';

const updateById = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    updateById: (...args: unknown[]) => updateById(...args),
    switchWorkspacePlan: vi.fn(),
  },
}));
// One stable result, as react-query gives: a new array each render re-seeds the form.
const plansResult = { data: [], isLoading: false, isError: false };
vi.mock('@/hooks/usePlatformAdmin', () => ({ usePlatformPlans: () => plansResult }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { EditWorkspaceModal } = await import('../EditWorkspaceModal');

const workspace = (over: Partial<Organization> = {}) =>
  ({ id: 9, name: 'Example Workspace', description: null, active: true, ...over }) as Organization;

const open = (org: Organization) =>
  render(<EditWorkspaceModal org={org} isOpen onClose={vi.fn()} onSaved={vi.fn()} />);
const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(updateById).toHaveBeenCalled());
};
const sent = () => updateById.mock.calls[0][1] as Record<string, unknown>;

beforeEach(() => updateById.mockReset().mockResolvedValue({}));
afterEach(cleanup);

describe('Edit workspace — status', () => {
  it('⛔ a rename does not send the status at all', async () => {
    open(workspace());
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Workspace Renamed' } });
    await save();
    expect(sent()).toEqual({ name: 'Workspace Renamed', description: null });
  });

  it('⛔ a row without the field is not shown as Inactive, and Save leaves the status alone', async () => {
    open(workspace({ active: undefined as unknown as boolean }));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
    await save();
    expect(sent()).not.toHaveProperty('active');
  });

  it('CONTROL: an inactive workspace reads Inactive', () => {
    open(workspace({ active: false }));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('CONTROL: flipping the switch sends the new status', async () => {
    open(workspace());
    fireEvent.click(screen.getByRole('switch'));
    await save();
    expect(sent()).toMatchObject({ active: false });
  });
});

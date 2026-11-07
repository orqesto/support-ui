/**
 * A save that fails (a 403, the network) used to leave the control silently unchanged: the
 * handlers had try/finally and no catch (moderators on PATCH /auto-assign, staging 2026-11-03).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const updateAutoAssign = vi.fn<(mode: string) => Promise<void>>();
const updateAssignOnReply = vi.fn<(next: boolean) => Promise<void>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getRoutingKeys: () => Promise.resolve([]),
    getAutoAssign: () => Promise.resolve({ mode: 'always', assignOnReply: true }),
    getSelfEditSkills: () => Promise.resolve({ allowSelfEditSkills: false }),
    updateAutoAssign: (mode: string) => updateAutoAssign(mode),
    updateAssignOnReply: (next: boolean) => updateAssignOnReply(next),
    updateSelfEditSkills: vi.fn(),
    addRoutingKey: vi.fn(),
    deleteRoutingKey: vi.fn(),
  },
}));
vi.mock('../RoutingValueDescriptions', () => ({ RoutingValueDescriptions: () => null }));
vi.mock('../RoutingTestBox', () => ({ RoutingTestBox: () => null }));

const { RoutingKeysSettings } = await import('../RoutingKeysSettings');

describe('RoutingKeysSettings — a failed save says so', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a refused mode change shows an error and keeps the old mode', async () => {
    updateAutoAssign.mockRejectedValue(new Error('403'));
    render(<RoutingKeysSettings />);
    fireEvent.click(await screen.findByText('Match only'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the auto-assignment mode'
    );
    expect(updateAutoAssign).toHaveBeenCalledWith('match_only');
  });

  it('CONTROL: a mode change that saves shows no error', async () => {
    updateAutoAssign.mockResolvedValue();
    render(<RoutingKeysSettings />);
    fireEvent.click(await screen.findByText('Match only'));
    await waitFor(() => expect(updateAutoAssign).toHaveBeenCalledWith('match_only'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

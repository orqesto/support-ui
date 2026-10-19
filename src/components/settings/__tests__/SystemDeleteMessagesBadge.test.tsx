/**
 * "Delete Messages" empties every queue, Needs Routing included, so once the server confirms it
 * refreshes the sidebar badge's own query (useNotificationCounts) instead of leaving the old count
 * up until the 60 s poll. A delete the server refuses changes nothing and leaves it.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const calls = vi.hoisted(() => ({ invalidated: [] as unknown[], deleteAllMessages: vi.fn() }));
vi.mock('@/services/system.service', () => ({
  default: {
    startQueues: vi.fn(),
    stopQueues: vi.fn(),
    clearQueues: vi.fn(),
    deleteAllMessages: calls.deleteAllMessages,
    deleteAllTickets: vi.fn(),
    deleteAllKB: vi.fn(),
    deleteAllAttachments: vi.fn(),
    nuclearCleanup: vi.fn(),
  },
}));
vi.mock('@/components/ui/Select', () => ({
  Select: () => <div data-testid="react-select" />,
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: (filters: { queryKey?: unknown }) => {
      calls.invalidated.push(filters.queryKey);
    },
  }),
}));

const { SystemManagementSettings } = await import('../SystemManagementSettings');

beforeEach(() => {
  calls.invalidated = [];
  calls.deleteAllMessages.mockReset();
});
afterEach(cleanup);

const deleteAll = () => {
  render(<SystemManagementSettings />);
  fireEvent.click(screen.getByRole('button', { name: /Delete Messages/i }));
  fireEvent.change(screen.getByPlaceholderText('DELETE THREADS'), {
    target: { value: 'DELETE THREADS' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));
};

describe('System settings — Delete Messages refreshes the sidebar badge', () => {
  it('a delete the server confirms refreshes the badge counts', async () => {
    calls.deleteAllMessages.mockResolvedValue({ success: true });
    deleteAll();
    await waitFor(() => expect(calls.deleteAllMessages).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(calls.invalidated).toContainEqual(['notification-counts']));
  });

  it('control: a delete the server refuses leaves the badge', async () => {
    calls.deleteAllMessages.mockResolvedValue({ success: false, message: 'refused' });
    deleteAll();
    await waitFor(() => expect(calls.deleteAllMessages).toHaveBeenCalledTimes(1));
    expect(calls.invalidated).toEqual([]);
  });
});

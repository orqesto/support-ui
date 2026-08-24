/**
 * "Stop All Queues" pauses BullMQ, which persists the paused flag in Redis — so a
 * stopped queue stays stopped across restarts and releases. The product shipped
 * that button with no way back: the dialog promised processing would resume "until
 * queues are restarted" while nothing in the product could restart them, and
 * recovery meant redis-cli on the host.
 *
 * On production this went unnoticed for days: a paused queue is invisible from the
 * outside, jobs simply accumulate. So the control that undoes it has to exist AND
 * has to sit next to the one that caused it.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SystemManagementSettings } from '../SystemManagementSettings';

const startQueues = vi.fn();
const stopQueues = vi.fn();

vi.mock('@/services/system.service', () => ({
  default: {
    startQueues: () => startQueues() as unknown,
    stopQueues: () => stopQueues() as unknown,
    clearQueues: vi.fn(),
    deleteAllMessages: vi.fn(),
    deleteAllTickets: vi.fn(),
    deleteAllKB: vi.fn(),
    deleteAllAttachments: vi.fn(),
    nuclearCleanup: vi.fn(),
  },
}));
// Pulls in ThemeContext, which this test has no reason to stand up.
vi.mock('@/components/ui/ReactSelect', () => ({
  ReactSelect: () => <div data-testid="react-select" />,
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: vi.fn(() => Promise.resolve([])) },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

beforeEach(() => {
  startQueues.mockReset();
  startQueues.mockResolvedValue({ success: true });
  stopQueues.mockReset();
  stopQueues.mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe('System settings — resuming queues', () => {
  it('offers a way back from Stop, on the same screen', () => {
    render(<SystemManagementSettings />);
    // Both must be present. A resume that lives elsewhere is not discoverable by
    // the person staring at a frozen queue.
    expect(screen.getByRole('button', { name: /Stop Queues/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Queues/i })).toBeInTheDocument();
  });

  it('calls the resume endpoint once confirmed', async () => {
    render(<SystemManagementSettings />);

    fireEvent.click(screen.getByRole('button', { name: /Start Queues/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }));

    await waitFor(() => expect(startQueues).toHaveBeenCalledTimes(1));
    expect(stopQueues).not.toHaveBeenCalled();
  });

  it('says the pause outlives a restart, so nobody waits for a redeploy to fix it', () => {
    render(<SystemManagementSettings />);
    expect(screen.getByText(/stay paused\s+across restarts and releases/i)).toBeInTheDocument();
  });
});

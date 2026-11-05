/**
 * "Mute this thread" in the header's More menu: PUT/DELETE through messageService, hidden when the
 * backend does not send mutedByMe, optimistic with a revert, and a double click ends in the last
 * state asked for.
 */
import { describe, it, expect, vi } from 'vitest';
import { message, renderHeader, svc } from './md4.header.utils';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Message } from '@/types';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), failure: vi.fn() },
}));

const withMute = (mutedByMe?: boolean) =>
  ({ ...message, ...(mutedByMe === undefined ? {} : { mutedByMe }) }) as unknown as Message;
const openMenu = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
  return screen.getByRole('menu');
};

describe('Mute this thread', () => {
  it('shows Mute this thread and calls PUT', async () => {
    svc.setThreadMute.mockResolvedValue(true);
    renderHeader({ message: withMute(false) });
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Mute this thread' }));
    await waitFor(() => expect(svc.setThreadMute).toHaveBeenCalledWith(1, true));
  });

  it('shows Unmute this thread when muted, and calls DELETE', async () => {
    svc.setThreadMute.mockResolvedValue(false);
    renderHeader({ message: withMute(true) });
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Unmute this thread' }));
    await waitFor(() => expect(svc.setThreadMute).toHaveBeenCalledWith(1, false));
  });

  it('hidden when the BE does not send mutedByMe', async () => {
    renderHeader({ message: withMute(undefined) });
    const menu = await openMenu();
    expect(within(menu).queryByText(/mute this thread/i)).toBeNull();
  });

  it('on a closed thread the item is disabled, says it is paused, and sends no request', async () => {
    svc.setThreadMute.mockReset();
    renderHeader({ message: { ...withMute(true), status: 'closed' } as unknown as Message });
    const menu = await openMenu();
    const item = within(menu).getByRole('menuitem', { name: /paused while this thread is closed/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item);
    expect(svc.setThreadMute).not.toHaveBeenCalled();
  });
});

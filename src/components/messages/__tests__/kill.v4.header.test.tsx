/**
 * Mutation batch (message detail v4), chunk 4: MessageDetailHeader survivors that are behaviour —
 * the full-page link's three conditions, the sender opening the contact profile, and the phone
 * More sheet being a modal layer (first item focused, Escape closes).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHeader, setPhone, svc } from './md4.header.utils';
import { screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';

// The drawer itself is another component's (contacts); here only its opening is the subject.
vi.mock('@/components/contacts/ContactProfilePanel', () => ({
  ContactProfilePanel: (props: { email?: string | null }) => (
    <div data-testid="contact-profile">{props.email}</div>
  ),
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

afterEach(() => {
  cleanup();
  setPhone(false);
});

describe('the Open full page link', () => {
  it('shows on a desktop slide-over that offers it, and only there', () => {
    renderHeader({ showFullPageButton: true, isFullPage: false });
    expect(screen.getByRole('link', { name: 'Open full page' })).toBeInTheDocument();
    cleanup();
    // Already on the full page: nothing to open.
    renderHeader({ showFullPageButton: true, isFullPage: true });
    expect(screen.queryByRole('link', { name: 'Open full page' })).toBeNull();
    cleanup();
    // Not offered by the host.
    renderHeader({ showFullPageButton: false, isFullPage: false });
    expect(screen.queryByRole('link', { name: 'Open full page' })).toBeNull();
    cleanup();
    // A phone: the action lives in More, not the top row.
    setPhone(true);
    renderHeader({ showFullPageButton: true, isFullPage: false });
    expect(screen.queryByRole('link', { name: 'Open full page' })).toBeNull();
  });
});

describe('the sender', () => {
  it('opens the contact profile when pressed', async () => {
    renderHeader();
    expect(screen.queryByTestId('contact-profile')).toBeNull();
    fireEvent.click(screen.getByTitle('View contact profile'));
    expect(await screen.findByTestId('contact-profile')).toHaveTextContent('ada@example.com');
  });
});

describe('the More sheet on a phone is a modal layer', () => {
  it('its first item takes focus, and Escape closes it', async () => {
    setPhone(true);
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('CONTROL desktop: the popover does not pull focus to its first item', async () => {
    renderHeader();
    await waitFor(() => expect(svc.listMerges).toHaveBeenCalled());
    const more = screen.getByRole('button', { name: 'More actions' });
    more.focus();
    fireEvent.click(more);
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.activeElement).not.toBe(items[0]);
  });
});

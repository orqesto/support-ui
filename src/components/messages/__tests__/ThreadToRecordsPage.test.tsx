/**
 * From a THREAD to the customer's records page — the half of "easy to find" that stayed unmet.
 *
 * Owner, 2026-09-20: "Check an order id and All a client's orders → it should be easy to find
 * these features". CA-6 gave the records a real page, and from a thread there was no way to it:
 * the panel offered the link only when a contact id was already known, and the thread surface
 * mounts it without one, because a link that GUESSED a contact would open a stranger's page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const resolve = vi.fn();
vi.mock('@/services/conversationContact.service', () => ({
  conversationContactService: { resolve },
}));
vi.mock('@/hooks/useCustomApiLookup', () => ({
  useCustomApiLookup: () => ({ results: [], loading: false, error: null, run: vi.fn() }),
  useCustomApiLookupAvailability: () => true,
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { CustomApiLookupPanel } = await import('@/components/messages/CustomApiLookupPanel');

const renderPanel = () =>
  render(
    <MemoryRouter initialEntries={['/messages/88']}>
      <Routes>
        <Route path="/messages/:id" element={<CustomApiLookupPanel conversationId={88} />} />
        <Route path="/contacts/:id/records" element={<p>RECORDS PAGE FOR CUSTOMER</p>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  resolve.mockResolvedValue({ contactId: 5, created: false });
});

describe('opening the records page from a thread', () => {
  it('resolves this conversation’s customer and goes to their page', async () => {
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /Open the full records page/ }));

    await waitFor(() => expect(resolve).toHaveBeenCalledWith(88));
    expect(await screen.findByText('RECORDS PAGE FOR CUSTOMER')).toBeInTheDocument();
  });

  it('⛔ resolves on the PRESS, never on render', async () => {
    /**
     * 🔴 IT WRITES: resolving may CREATE a customer record. A row created because a panel mounted
     * is one nobody can account for, and this panel mounts on every thread an agent opens.
     * RED: move the call into an effect and this fails before anything is clicked.
     */
    renderPanel();

    await screen.findByRole('button', { name: /Open the full records page/ });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('⛔ says why when the thread has no customer address, and does not navigate', async () => {
    /**
     * The backend answers 400 for our own sent mail with no parent, and for channels that name
     * people some other way — rather than inventing an identity. A link that silently did nothing
     * reads as a broken page, which is the conclusion this feature has already cost three times.
     */
    resolve.mockRejectedValue({
      response: { status: 400, data: { error: 'This conversation has no customer address.' } },
    });
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: /Open the full records page/ }));

    expect(await screen.findByText(/no customer address/i)).toBeInTheDocument();
    expect(screen.queryByText('RECORDS PAGE FOR CUSTOMER')).toBeNull();
  });
});

/**
 * "Look up another email" (2026-09-29).
 *
 * taco DEU-SUP-8049 is the shop's own order notification: its customer is the shop, and the buyer
 * (`sergio@deuspower.org`) is only in the body. The agent types the buyer's email and the panel runs
 * as them. These pin that the email reaches the backend on EVERY press made in that mode, and that
 * the "showing results for" banner appears only when the backend CONFIRMED it — an older backend
 * drops the field and answers for the ticket's customer, which must never be labelled as the buyer.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CustomApiLookupPanel, NO_EMAIL_IDENTITY_NOTE } from '../CustomApiLookupPanel';
import type * as LookupService from '@/services/customApiLookup.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

type Result = LookupService.CustomApiLookupResult;

const runDetailed = vi.fn<(body: Record<string, unknown>) => Promise<LookupService.LookupRun>>();
let echo = true;

vi.mock('@/services/customApiLookup.service', async () => {
  const actual = await vi.importActual<typeof LookupService>('@/services/customApiLookup.service');
  return {
    ...actual,
    customApiLookupService: {
      runDetailed: (body: Record<string, unknown>) => runDetailed(body),
      // A press WITHOUT a typed email goes through the ordinary path.
      run: async (body: Record<string, unknown>) => (await runDetailed(body)).results,
      availability: () => Promise.resolve(true),
    },
  };
});

const ORDER_CARD = {
  endpointId: 20,
  label: 'Order details',
  connectionName: 'DeusPower',
  resultShape: 'one',
  status: 'needs_input',
} as Result;

const render = (ui: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return rtlRender(ui, { wrapper });
};

const TYPED = 'sergio@deuspower.org';

beforeEach(() => {
  // The availability query runs only for a signed-in user in a workspace.
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
  echo = true;
  runDetailed.mockReset();
  runDetailed.mockImplementation((body) =>
    Promise.resolve({
      results: [ORDER_CARD],
      lookedUpAs: echo && typeof body.lookupEmail === 'string' ? body.lookupEmail : null,
    })
  );
});

const typeAndRun = async (email = TYPED) => {
  await userEvent.type(await screen.findByLabelText('Look up another email'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Look up as' }));
};

describe('look up another email', () => {
  it('is open straight away on a ticket with no customer email, and runs as the typed person', async () => {
    render(<CustomApiLookupPanel conversationId={24425} identityNote={NO_EMAIL_IDENTITY_NOTE} />);

    await typeAndRun('  Sergio@DeusPower.org ');

    // RED: drop lookupEmail from the request ⇒ the panel re-runs as the shop.
    expect(runDetailed).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 24425, lookupEmail: TYPED })
    );
    expect(await screen.findByText(/Showing results for/)).toHaveTextContent(TYPED);
  });

  it('sits behind a link when the ticket has a customer email', async () => {
    render(<CustomApiLookupPanel conversationId={1} />);
    expect(screen.queryByLabelText('Look up another email')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Look up another email' }));
    expect(screen.getByLabelText('Look up another email')).toBeInTheDocument();
  });

  it('will not send something that is not an email', async () => {
    render(<CustomApiLookupPanel conversationId={1} identityNote={NO_EMAIL_IDENTITY_NOTE} />);
    await userEvent.type(await screen.findByLabelText('Look up another email'), 'sergio');
    expect(screen.getByRole('button', { name: 'Look up as' })).toBeDisabled();
  });

  it('⛔ an older backend that ignored the email: no banner, no rows, and says why', async () => {
    echo = false;
    render(<CustomApiLookupPanel conversationId={1} identityNote={NO_EMAIL_IDENTITY_NOTE} />);

    await typeAndRun();

    // RED: trust the request ⇒ the ticket customer's records appear under the typed person's name.
    expect(await screen.findByText('This server cannot look up another email yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Showing results for/)).toBeNull();
    expect(screen.queryByText('Order details')).toBeNull();
  });

  it('a typed order number made in that mode is checked against the typed person', async () => {
    render(<CustomApiLookupPanel conversationId={1} identityNote={NO_EMAIL_IDENTITY_NOTE} />);
    await typeAndRun();

    await userEvent.type(await screen.findByLabelText('Record number for Order details'), '137416');
    // [0] is the panel's own press, [1] this card's.
    await userEvent.click(screen.getAllByRole('button', { name: /^look up$/i })[1]);

    // RED: the manual press forgets the mode ⇒ "is it theirs" is judged against the shop.
    expect(runDetailed).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpointId: 20, parameter: '137416', lookupEmail: TYPED })
    );
  });

  it('clears the typed address when the agent moves to another ticket', async () => {
    const { rerender } = render(
      <CustomApiLookupPanel conversationId={1} identityNote={NO_EMAIL_IDENTITY_NOTE} />
    );
    await userEvent.type(await screen.findByLabelText('Look up another email'), TYPED);

    rerender(<CustomApiLookupPanel conversationId={2} identityNote={NO_EMAIL_IDENTITY_NOTE} />);

    // RED: keep it ⇒ the last ticket's buyer is one press away from being looked up from this one.
    expect(screen.getByLabelText('Look up another email')).toHaveValue('');
  });

  it('"Back to the customer" runs as the ticket customer again and drops the banner', async () => {
    render(<CustomApiLookupPanel conversationId={1} identityNote={NO_EMAIL_IDENTITY_NOTE} />);
    await typeAndRun();
    await screen.findByText(/Showing results for/);

    await userEvent.click(screen.getByRole('button', { name: 'Back to the customer' }));

    expect(runDetailed.mock.lastCall?.[0]).not.toHaveProperty('lookupEmail');
    expect(screen.queryByText(/Showing results for/)).toBeNull();
  });
});

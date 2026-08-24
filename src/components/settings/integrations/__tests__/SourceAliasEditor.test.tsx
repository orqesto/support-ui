/**
 * Adopting an address is a consequential switch, not a label: the declared set is
 * what direction detection uses to decide "is this ours", and a wrongly adopted
 * address turns that person's mail into our own outgoing — which, with no
 * recoverable correspondent, leaves the inbox entirely.
 *
 * So the tests that matter here are about what the panel must NOT do: never
 * pre-select something merely observed, never let a stale backend look like an
 * empty mailbox, and never send a partial alias list to an endpoint that replaces
 * the array wholesale.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceAliasEditor, declaredAliases } from '../SourceAliasEditor';

const getReceivedAddresses = vi.fn();
const update = vi.fn();

vi.mock('@/services/message.service', () => ({
  messageService: {
    getReceivedAddresses: () => getReceivedAddresses() as unknown,
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: {
    update: (...args: unknown[]) => update(...args) as unknown,
  },
}));

const senderRow = (address: string, extra: Record<string, unknown> = {}) => ({
  address,
  conversations: 257,
  lastSeenAt: '2026-08-20T10:00:00.000Z',
  likelyOurs: false,
  ...extra,
});

const row = (address: string, extra: Record<string, unknown> = {}) => ({
  address,
  conversations: 3,
  lastSeenAt: '2026-08-20T10:00:00.000Z',
  messageSourceIds: [7],
  configured: false,
  declared: false,
  attachedToSourceId: null,
  ...extra,
});

const renderPanel = (declared: string[] = []) =>
  render(
    <SourceAliasEditor
      sourceId={7}
      sourceType="gmail"
      declared={declared}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />
  );

afterEach(() => {
  cleanup();
  getReceivedAddresses.mockReset();
  update.mockReset();
});

describe('SourceAliasEditor', () => {
  it('does not pre-select an address that was merely observed', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [row('info@shop.es'), row('supplier@other.com')],
      senderCandidates: [],
      coverage: { conversations: 10, withDeliveryAddress: 10 },
    });
    renderPanel([]);

    await screen.findByText('info@shop.es');
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(7, { type: 'gmail', config: { aliases: [] } });
  });

  it('sends the FULL alias set, because the array replaces wholesale', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [row('a@shop.es', { declared: true }), row('b@shop.de')],
      senderCandidates: [],
      coverage: { conversations: 10, withDeliveryAddress: 10 },
    });
    renderPanel(['a@shop.es']);

    await screen.findByText('b@shop.de');
    // Adopt the second one; the already-declared first must survive the save.
    fireEvent.click(screen.getByRole('switch', { name: /b@shop\.de/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(7, {
      type: 'gmail',
      config: { aliases: ['a@shop.es', 'b@shop.de'] },
    });
  });

  it('lets you add by hand even when the backend cannot suggest anything', async () => {
    // Save must stay ENABLED here. This is the deployment where suggestions are
    // impossible — no route, or no delivery data — and it is exactly the one where
    // typing the address in by hand is the only way to declare an alias at all.
    getReceivedAddresses.mockResolvedValue(null);
    renderPanel(['already@shop.es']);

    await screen.findByText(/cannot suggest addresses yet/i);
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    // The already-declared alias is still listed, so it cannot be silently dropped.
    expect(screen.getByText('already@shop.es')).toBeInTheDocument();
  });

  it('says how thin the delivery evidence is', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [row('info@shop.es')],
      senderCandidates: [],
      coverage: { conversations: 976, withDeliveryAddress: 46 },
    });
    renderPanel([]);

    expect(
      await screen.findByText(/known for 46 of 976 conversations/i)
    ).toBeInTheDocument();
  });

  it('locks the configured address on — it is ours by definition', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [row('info@shop.info', { configured: true })],
      senderCandidates: [],
      coverage: { conversations: 10, withDeliveryAddress: 10 },
    });
    renderPanel([]);

    const toggle = await screen.findByRole('switch', { name: /info@shop\.info/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toBeDisabled();
  });

  it('will not let an address already owned by another mailbox be adopted here', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [row('shared@shop.es', { attachedToSourceId: 99 })],
      senderCandidates: [],
      coverage: { conversations: 10, withDeliveryAddress: 10 },
    });
    renderPanel([]);

    expect(await screen.findByRole('switch', { name: /shared@shop\.es/ })).toBeDisabled();
  });
});

describe('declaredAliases', () => {
  it.each([
    [undefined, []],
    [null, []],
    [{}, []],
    [{ aliases: 'not-a-list' }, []],
    [{ aliases: ['a@x.com', 42, null, 'b@x.com'] }, ['a@x.com', 'b@x.com']],
  ])('narrows %p to %p rather than trusting the shape', (config, expected) => {
    expect(declaredAliases(config)).toEqual(expected);
  });
});

/**
 * The reason this panel exists at all. On the client it was built for, `recipients`
 * is empty across the archive — measured 0 of 40 sampled threads — so suggestions
 * from delivery data alone offer nothing and the customer cannot declare a single
 * alias. Sender-derived candidates and manual entry are what make it usable there.
 */
describe('SourceAliasEditor — when delivery data is empty', () => {
  it('offers sender-derived candidates and adopts one', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [],
      senderCandidates: [
        senderRow('info@coresarms.co.uk', { conversations: 257, likelyOurs: true }),
        senderRow('a.customer@gmail.com', { conversations: 2 }),
      ],
      coverage: { conversations: 931, withDeliveryAddress: 0 },
    });
    renderPanel([]);

    await screen.findByText('info@coresarms.co.uk');
    expect(screen.getByText('a.customer@gmail.com')).toBeInTheDocument();
    // Labelled as the weaker signal, and hinted — but still not selected.
    expect(screen.getAllByText(/seen as sender/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/matches your mailbox/i)).toBeInTheDocument();
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    }

    fireEvent.click(screen.getByRole('switch', { name: /info@coresarms\.co\.uk/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(7, {
      type: 'gmail',
      config: { aliases: ['info@coresarms.co.uk'] },
    });
  });

  it('adds an address typed by hand and saves it', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [],
      senderCandidates: [],
      coverage: { conversations: 931, withDeliveryAddress: 0 },
    });
    renderPanel([]);

    await screen.findByText(/No addresses suggested yet/i);
    fireEvent.change(screen.getByLabelText('Add an address by hand'), {
      target: { value: '  INFO@Coresarms.DE  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    // Normalised, listed, and selected — typing it is an act of adoption.
    expect(screen.getByText('info@coresarms.de')).toBeInTheDocument();
    // Labelled by where it came from. Falling back to the generic "declared" here
    // would hide that this address has no evidence behind it at all.
    expect(screen.getByText(/added by you/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(7, {
      type: 'gmail',
      config: { aliases: ['info@coresarms.de'] },
    });
  });

  it('refuses something that is not an address', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [],
      senderCandidates: [],
      coverage: { conversations: 0, withDeliveryAddress: 0 },
    });
    renderPanel([]);
    await screen.findByText(/No addresses suggested yet/i);

    fireEvent.change(screen.getByLabelText('Add an address by hand'), {
      target: { value: 'not-an-address' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(screen.getByText(/does not look like an email address/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(7, { type: 'gmail', config: { aliases: [] } });
  });

  it('selects rather than duplicates when the typed address is already listed', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [],
      senderCandidates: [senderRow('info@coresarms.co.uk')],
      coverage: { conversations: 931, withDeliveryAddress: 0 },
    });
    renderPanel([]);
    await screen.findByText('info@coresarms.co.uk');

    fireEvent.change(screen.getByLabelText('Add an address by hand'), {
      target: { value: 'info@coresarms.co.uk' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(screen.getAllByText('info@coresarms.co.uk')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(7, {
      type: 'gmail',
      config: { aliases: ['info@coresarms.co.uk'] },
    });
  });
});

describe('SourceAliasEditor — search and sort', () => {
  const many = {
    addresses: [],
    senderCandidates: [
      senderRow('info@coresarms.co.uk', { conversations: 257 }),
      senderRow('info@coresarms.de', { conversations: 49 }),
      senderRow('zeta@other.com', { conversations: 3 }),
      senderRow('alpha@other.com', { conversations: 1 }),
    ],
    coverage: { conversations: 931, withDeliveryAddress: 0 },
  };

  it('filters the list by search', async () => {
    getReceivedAddresses.mockResolvedValue(many);
    renderPanel([]);
    await screen.findByText('info@coresarms.co.uk');

    fireEvent.change(screen.getByPlaceholderText('Search addresses'), {
      target: { value: 'coresarms' },
    });

    expect(screen.getByText('info@coresarms.co.uk')).toBeInTheDocument();
    expect(screen.queryByText('zeta@other.com')).toBeNull();
  });

  it('SAVES THE FULL SET even while a search is filtering the view', async () => {
    // The API replaces the alias array wholesale, so saving the filtered view would
    // silently delete every alias not matching the search box.
    getReceivedAddresses.mockResolvedValue(many);
    renderPanel(['info@coresarms.de']);
    await screen.findByText('info@coresarms.co.uk');

    fireEvent.click(screen.getByRole('switch', { name: /info@coresarms\.co\.uk/ }));
    fireEvent.change(screen.getByPlaceholderText('Search addresses'), {
      target: { value: 'zeta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(7, {
      type: 'gmail',
      config: { aliases: ['info@coresarms.de', 'info@coresarms.co.uk'] },
    });
  });

  it('orders by volume by default and alphabetically on request', async () => {
    getReceivedAddresses.mockResolvedValue(many);
    renderPanel([]);
    await screen.findByText('info@coresarms.co.uk');

    // Toggle carries its name on the wrapping <label>, not an aria-label attribute.
    const listed = () =>
      screen.getAllByRole('switch').map((node) => node.closest('label')?.textContent ?? '');

    expect(listed()[0]).toMatch(/info@coresarms\.co\.uk/);

    fireEvent.change(screen.getByLabelText('Sort addresses'), { target: { value: 'address' } });
    expect(listed()[0]).toMatch(/alpha@other\.com/);
  });
});

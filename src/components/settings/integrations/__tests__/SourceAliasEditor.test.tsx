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

  it('distinguishes "backend cannot answer" from "no addresses", and blocks saving', async () => {
    getReceivedAddresses.mockResolvedValue(null);
    renderPanel(['already@shop.es']);

    await screen.findByText(/cannot list delivery addresses yet/i);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Critically NOT the empty-mailbox copy, which would read as "you receive on
    // nothing" and invite someone to re-declare aliases that already exist.
    expect(screen.queryByText(/No delivery addresses recorded yet/i)).toBeNull();
  });

  it('says how thin the evidence is when older mail predates delivery recording', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [row('info@shop.es')],
      coverage: { conversations: 976, withDeliveryAddress: 46 },
    });
    renderPanel([]);

    expect(await screen.findByText(/Based on 46 of 976 conversations/i)).toBeInTheDocument();
  });

  it('locks the configured address on — it is ours by definition', async () => {
    getReceivedAddresses.mockResolvedValue({
      addresses: [row('info@shop.info', { configured: true })],
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { RoutingValue } from '@/types/skillRouting';

/**
 * Settings → Routing skills → a key's values (BE spec 2026-11-02 skill routing §6.8): what each
 * value matches is the admin's description; Suggest drafts one with AI; an older backend without
 * the endpoint hides the section instead of erroring.
 */
const getRoutingKeyValues = vi.fn<(key: string) => Promise<RoutingValue[] | null>>();
const setRoutingValueDescription =
  vi.fn<(key: string, value: string, description: string | null) => Promise<void>>();
const deleteRoutingValue = vi.fn<(key: string, value: string) => Promise<void>>();
const suggestRoutingValueDescription =
  vi.fn<
    (
      key: string,
      value: string
    ) => Promise<{ description: string } | { refused: 'no_ai' | 'budget' | 'failed' }>
  >();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getRoutingKeyValues: (key: string) => getRoutingKeyValues(key),
    setRoutingValueDescription: (key: string, value: string, description: string | null) =>
      setRoutingValueDescription(key, value, description),
    deleteRoutingValue: (key: string, value: string) => deleteRoutingValue(key, value),
    suggestRoutingValueDescription: (key: string, value: string) =>
      suggestRoutingValueDescription(key, value),
  },
}));

import { RoutingValueDescriptions } from '../RoutingValueDescriptions';

const row = (overrides: Partial<RoutingValue> = {}): RoutingValue => ({
  value: 'usdc',
  description: 'USD Coin (Circle)',
  holders: 2,
  unused: false,
  reassigned30d: 0,
  knownLanguage: null,
  ...overrides,
});

describe('RoutingValueDescriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRoutingValueDescription.mockResolvedValue();
  });

  it('lists each value with its holders and description; saving sends the edited text', async () => {
    getRoutingKeyValues.mockResolvedValue([
      row(),
      row({ value: 'usdt', description: null, holders: 0, unused: true, reassigned30d: 3 }),
    ]);
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    expect(await screen.findByText('usdc')).toBeInTheDocument();
    expect(screen.getByText(/2 agents/)).toBeInTheDocument();
    expect(screen.getByText(/unused/i)).toBeInTheDocument();
    expect(screen.getByText(/3 reassigned in 30 days/)).toBeInTheDocument();
    const field = screen.getByLabelText('Description for usdt');
    fireEvent.change(field, { target: { value: 'Tether, crypto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save usdt' }));
    await waitFor(() =>
      expect(setRoutingValueDescription).toHaveBeenCalledWith(
        'payment_sys',
        'usdt',
        'Tether, crypto'
      )
    );
  });

  it('Suggest fills the field with the draft (not saved until Save)', async () => {
    getRoutingKeyValues.mockResolvedValue([row({ description: null })]);
    suggestRoutingValueDescription.mockResolvedValue({
      description: 'USD Coin, Circle, stablecoin',
    });
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest usdc' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Description for usdc')).toHaveValue(
        'USD Coin, Circle, stablecoin'
      )
    );
    expect(setRoutingValueDescription).not.toHaveBeenCalled();
  });

  it('a refused suggestion says why', async () => {
    getRoutingKeyValues.mockResolvedValue([row()]);
    suggestRoutingValueDescription.mockResolvedValue({ refused: 'no_ai' });
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest usdc' }));
    expect(await screen.findByText(/No AI provider/)).toBeInTheDocument();
  });

  it('a language value the router does not recognise is flagged', async () => {
    getRoutingKeyValues.mockResolvedValue([
      row({ value: 'klingon', description: null, knownLanguage: false }),
    ]);
    render(<RoutingValueDescriptions routingKey="lang" keyType="language" />);
    expect(await screen.findByText(/not a known language/i)).toBeInTheDocument();
  });

  it('no values yet → says how to add them', async () => {
    getRoutingKeyValues.mockResolvedValue([]);
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    expect(await screen.findByText(/No values yet/)).toBeInTheDocument();
  });

  it('an older backend (null) renders nothing — no dead controls', async () => {
    getRoutingKeyValues.mockResolvedValue(null);
    const { container } = render(
      <RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />
    );
    await waitFor(() => expect(getRoutingKeyValues).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import {
  SKILL_PATTERN_PRESETS,
  type RoutingValue,
  type SkillPatternPreset,
} from '@/types/skillRouting';

/**
 * Settings → Routing skills → a key's values (BE spec 2026-11-02 skill routing §6.8): what each
 * value matches is the admin's description; Suggest drafts one with AI; an older backend without
 * the endpoint hides the section instead of erroring.
 */
const getRoutingKeyValues =
  vi.fn<
    (key: string, options?: { includeReassigned?: boolean }) => Promise<RoutingValue[] | null>
  >();
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
const getRoutingPatternPresets =
  vi.fn<() => Promise<{ presets: SkillPatternPreset[]; legacy: boolean }>>();
const getWorkspaceSkillValues =
  vi.fn<() => Promise<Record<string, Record<string, string[]>> | null>>();
const getMembers = vi.fn<() => Promise<unknown[]>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getWorkspaceSkillValues: () => getWorkspaceSkillValues(),
    getMembers: () => getMembers(),
    getRoutingPatternPresets: () => getRoutingPatternPresets(),
    getRoutingKeyValues: (key: string, options?: { includeReassigned?: boolean }) =>
      getRoutingKeyValues(key, options),
    setRoutingValueDescription: (key: string, value: string, description: string | null) =>
      setRoutingValueDescription(key, value, description),
    deleteRoutingValue: (key: string, value: string) => deleteRoutingValue(key, value),
    suggestRoutingValueDescription: (key: string, value: string) =>
      suggestRoutingValueDescription(key, value),
  },
}));

import { RoutingValueDescriptions } from '../RoutingValueDescriptions';

// The presets come through react-query (once per page): each render gets a fresh cache.
const render = (node: ReactElement) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const row = (overrides: Partial<RoutingValue> = {}): RoutingValue => ({
  value: 'usdc',
  description: 'USD Coin (Circle)',
  holders: 2,
  unused: false,
  reassigned30d: 0,
  knownLanguage: null,
  terms: ['usdc', 'usd coin', 'circle'],
  ...overrides,
});

describe('RoutingValueDescriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRoutingValueDescription.mockResolvedValue();
    getRoutingPatternPresets.mockResolvedValue({
      presets: [...SKILL_PATTERN_PRESETS],
      legacy: false,
    });
    getWorkspaceSkillValues.mockReset();
    getWorkspaceSkillValues.mockResolvedValue({});
    getMembers.mockReset();
    getMembers.mockResolvedValue([]);
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

  it('shows the keywords matching uses, and asks for the reassignment count', async () => {
    getRoutingKeyValues.mockResolvedValue([row()]);
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    expect(await screen.findByText(/Matches: usdc, usd coin, circle/)).toBeInTheDocument();
    expect(getRoutingKeyValues).toHaveBeenCalledWith('payment_sys', { includeReassigned: true });
  });

  it('a failed suggestion or delete says so (no unhandled rejection)', async () => {
    getRoutingKeyValues.mockResolvedValue([row()]);
    suggestRoutingValueDescription.mockRejectedValue(new Error('boom'));
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest usdc' }));
    expect(await screen.findByText(/could not answer/i)).toBeInTheDocument();
  });

  it('topic and language values show the text patterns editor; only language keys get the language note; an older backend shows none', async () => {
    getRoutingKeyValues.mockResolvedValue([row({ patterns: [{ preset: 'evm_tx_hash' }] })]);
    const { unmount } = render(
      <RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />
    );
    expect(await screen.findByRole('checkbox', { name: /EVM transaction hash/ })).toBeChecked();
    expect(screen.queryByText(/language still decides/)).not.toBeInTheDocument();
    unmount();

    getRoutingKeyValues.mockResolvedValue([
      row({ value: 'russian', patterns: [{ regex: '[а-яё]{3,}' }] }),
    ]);
    const language = render(<RoutingValueDescriptions routingKey="lang" keyType="language" />);
    expect(await screen.findByText('[а-яё]{3,}')).toBeInTheDocument();
    expect(screen.getByText('Text patterns')).toBeInTheDocument();
    expect(screen.getByText(/detected or requested language still decides/)).toBeInTheDocument();
    language.unmount();

    // CONTROL: no `patterns` field (older backend) ⇒ no editor.
    getRoutingKeyValues.mockResolvedValue([row()]);
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    expect(await screen.findByText('usdc')).toBeInTheDocument();
    expect(screen.queryByText('Text patterns')).not.toBeInTheDocument();
  });

  it('loads the presets once for the whole list, not once per value', async () => {
    getRoutingKeyValues.mockResolvedValue([
      row({ value: 'usdc', patterns: [] }),
      row({ value: 'usdt', patterns: [{ preset: 'tron_address' }] }),
      row({ value: 'btc', patterns: [] }),
    ]);
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    expect(await screen.findByText('btc')).toBeInTheDocument();
    expect((await screen.findAllByRole('checkbox', { name: /Tron address/ })).length).toBe(3);
    expect(getRoutingPatternPresets).toHaveBeenCalledTimes(1);
  });

  it('a failed presets read still shows the editor, with the stored presets by id', async () => {
    getRoutingPatternPresets.mockRejectedValue(new Error('network'));
    getRoutingKeyValues.mockResolvedValue([row({ patterns: [{ preset: 'evm_tx_hash' }] })]);
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    expect(await screen.findByText(/Could not load the ready-made patterns/)).toBeInTheDocument();
    expect(screen.getByText('evm_tx_hash')).toBeInTheDocument();
  });
});

describe('holders by name (owner 2026-11-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRoutingPatternPresets.mockResolvedValue({
      presets: [...SKILL_PATTERN_PRESETS],
      legacy: false,
    });
    getWorkspaceSkillValues.mockReset();
    getMembers.mockReset();
    getMembers.mockResolvedValue([]);
  });
  it('each value names who holds it; keys and values compare like routing does', async () => {
    getRoutingKeyValues.mockResolvedValue([row(), row({ value: 'usdt', description: null })]);
    getWorkspaceSkillValues.mockResolvedValue({
      7: { 'Payment-Sys': ['USDC', 'usdt'] },
      8: { payment_sys: ['usdc'] },
      9: { lang: ['usdc'] },
    });
    getMembers.mockResolvedValue([
      { userId: 7, firstName: 'Ann', lastName: 'Agent', email: 'ann@example.test' },
      { userId: 8, firstName: null, lastName: null, email: 'bo@example.test' },
      { userId: 9, firstName: 'Cy', lastName: 'Other', email: 'cy@example.test' },
    ]);
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    expect(await screen.findByText('Held by: Ann Agent, bo@example.test')).toBeInTheDocument();
    expect(screen.getByText('Held by: Ann Agent')).toBeInTheDocument();
    expect(screen.queryByText(/Cy Other/)).not.toBeInTheDocument();
  });

  it('CONTROL — an older backend without the skills read shows only the count', async () => {
    getRoutingKeyValues.mockResolvedValue([row()]);
    getWorkspaceSkillValues.mockResolvedValue(null);
    render(<RoutingValueDescriptions routingKey="payment_sys" keyType="topic" />);
    expect(await screen.findByText('usdc')).toBeInTheDocument();
    expect(screen.queryByText(/Held by/)).not.toBeInTheDocument();
    expect(getMembers).not.toHaveBeenCalled();
  });
});

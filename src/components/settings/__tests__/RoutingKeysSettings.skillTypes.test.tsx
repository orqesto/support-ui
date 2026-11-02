import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RoutingKey } from '@/types/skillRouting';

const getRoutingKeys = vi.fn<() => Promise<RoutingKey[]>>();
const addRoutingKey = vi.fn<(key: string, description?: string, type?: string) => Promise<void>>();
const setRoutingKeyType = vi.fn<(key: string, type: string) => Promise<void>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getRoutingKeys: () => getRoutingKeys(),
    getAutoAssign: () => Promise.resolve({ mode: 'match_only', assignOnReply: true }),
    getSelfEditSkills: () => Promise.resolve({ allowSelfEditSkills: false }),
    addRoutingKey: (key: string, description?: string, type?: string) =>
      addRoutingKey(key, description, type),
    setRoutingKeyType: (key: string, type: string) => setRoutingKeyType(key, type),
    deleteRoutingKey: vi.fn(),
  },
}));
vi.mock('../RoutingValueDescriptions', () => ({
  RoutingValueDescriptions: ({ routingKey }: { routingKey: string }) => (
    <div>values of {routingKey}</div>
  ),
}));
vi.mock('../RoutingTestBox', () => ({ RoutingTestBox: () => <div>test box</div> }));

import { RoutingKeysSettings } from '../RoutingKeysSettings';

describe('RoutingKeysSettings — key types, values and the test box', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRoutingKeys.mockResolvedValue([
      { id: 1, key: 'lang', description: null, type: 'language' },
      { id: 2, key: 'payment_sys', description: 'Payment system', type: 'topic' },
    ]);
    addRoutingKey.mockResolvedValue();
    setRoutingKeyType.mockResolvedValue();
  });

  it('a key named like a language is added as a Language key', async () => {
    render(<RoutingKeysSettings />);
    fireEvent.change(await screen.findByPlaceholderText(/Key \(e\.g\./), {
      target: { value: 'idioma' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    await waitFor(() =>
      expect(addRoutingKey).toHaveBeenCalledWith('idioma', undefined, 'language')
    );
  });

  it('CONTROL: any other name is added as a Topic key', async () => {
    render(<RoutingKeysSettings />);
    fireEvent.change(await screen.findByPlaceholderText(/Key \(e\.g\./), {
      target: { value: 'region' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(addRoutingKey).toHaveBeenCalledWith('region', undefined, 'topic'));
  });

  it('each key shows its type and can switch it', async () => {
    render(<RoutingKeysSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Type of payment_sys: Topic' }));
    await waitFor(() => expect(setRoutingKeyType).toHaveBeenCalledWith('payment_sys', 'language'));
  });

  it('values open per key, and the test box is on the page', async () => {
    render(<RoutingKeysSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Values of payment_sys' }));
    expect(await screen.findByText('values of payment_sys')).toBeInTheDocument();
    expect(screen.getByText('test box')).toBeInTheDocument();
  });
});

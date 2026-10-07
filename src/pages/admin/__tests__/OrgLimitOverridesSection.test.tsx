/**
 * The console's per-workspace limits panel (owner decision D2): it shows plan / override /
 * effective for every limit and writes through PUT …/limit-overrides — Set sends the number,
 * Clear sends null (the plan applies again).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let puts: Array<{ url: string; body: unknown }> = [];
const payload = {
  planName: 'starter',
  trialing: false,
  enforced: true,
  limits: [
    { key: 'maxUsers', plan: 5, override: null, effective: 5 },
    { key: 'maxMessagesPerMonth', plan: 4000, override: { value: 9000, reason: null, updatedAt: '' }, effective: 9000 },
    { key: 'maxDepartments', plan: 999999, override: null, effective: 999999 },
  ],
};
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => Promise.resolve({ data: { data: payload } }),
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return Promise.resolve({ data: { data: {} } });
    },
  },
}));

const { OrgLimitOverridesSection } = await import('../OrgLimitOverridesSection');

beforeEach(() => {
  puts = [];
});
afterEach(cleanup);

describe('OrgLimitOverridesSection', () => {
  it('shows effective values, marks an override, and Unlimited for 999999', async () => {
    render(<OrgLimitOverridesSection orgId={42} />);
    await screen.findByText('Users');
    expect(screen.getByText('override')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('Set sends the number for that one limit', async () => {
    render(<OrgLimitOverridesSection orgId={42} />);
    const input = await screen.findByLabelText('Users override');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Set' })[0]);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/organizations/42/limit-overrides',
      body: { limitKey: 'maxUsers', value: 12 },
    });
  });

  it('Clear sends null; Set stays disabled for an invalid value', async () => {
    render(<OrgLimitOverridesSection orgId={42} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).toEqual({ limitKey: 'maxMessagesPerMonth', value: null });

    fireEvent.change(screen.getByLabelText('Users override'), { target: { value: '-3' } });
    expect(screen.getAllByRole('button', { name: 'Set' })[0]).toBeDisabled();
  });
});

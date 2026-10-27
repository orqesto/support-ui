/**
 * Console → Maintenance › Trusted addresses: the list is sent whole, one entry per line, and the
 * admin can add their own address in one click. A backend that predates the list shows no card.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TrustedAddressesCard, parseTrustedEntries } from '../TrustedAddressesCard';
import { normaliseMaintenance, type TrustedAddressesState } from '@/services/maintenance.service';

const renderCard = (state: TrustedAddressesState) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TrustedAddressesCard state={state} queryKey={['platform', 'maintenance']} />
    </QueryClientProvider>
  );

beforeEach(() => api.put.mockReset());
afterEach(cleanup);

describe('TrustedAddressesCard', () => {
  it('adds the admin own address and PUTs the whole list', async () => {
    api.put.mockResolvedValue({
      data: { data: { entries: ['198.51.100.0/24', '203.0.113.7'] } },
    });
    renderCard({ entries: ['198.51.100.0/24'], yourAddress: '203.0.113.7', selfHosted: false });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add my address (203.0.113.7)' }));
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/system/maintenance/trusted-addresses', {
        entries: ['198.51.100.0/24', '203.0.113.7'],
      })
    );
  });

  it('says the list changes nothing on a self-hosted server', () => {
    renderCard({ entries: [], yourAddress: null, selfHosted: true });
    expect(screen.getByText(/already off for everyone/)).toBeTruthy();
  });

  it('splits lines and commas, drops blanks and repeats', () => {
    expect(parseTrustedEntries(' 203.0.113.7 \n\n198.51.100.0/24, 203.0.113.7,')).toEqual([
      '203.0.113.7',
      '198.51.100.0/24',
    ]);
  });

  it('a backend without the list normalises to null (no card)', () => {
    expect(normaliseMaintenance({ jobs: [], repairs: {} }).trustedAddresses).toBeNull();
    expect(
      normaliseMaintenance({ trustedAddresses: { entries: ['203.0.113.7', 5] } }).trustedAddresses
    ).toEqual({ entries: ['203.0.113.7'], yourAddress: null, selfHosted: false });
  });
});

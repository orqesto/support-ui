import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

/**
 * Staging 2026-10-30: a brand-new workspace opened the Storage step with "Bring your own S3
 * bucket" selected. `GET /api/integrations/storage-config` answers for every workspace — one
 * with no storage of its own gets the platform's (`ownership: 'platform'`) — and the step
 * pre-selected BYO on ANY answer. Only `ownership: 'customer'` is the customer's own bucket.
 */

const get = vi.fn<(url: string) => Promise<{ data: { success: boolean; data: unknown } }>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (url: string) => get(url) } }));

// The BYO form has its own tests; here it only marks that BYO is selected.
vi.mock('@/components/settings/providers/ObjectStorageConfigCard', () => ({
  ObjectStorageConfigCard: () => <div data-testid="byo-form" />,
}));

const { StorageStep, isOwnStorage } = await import('../steps/StorageStep');

const answer = (data: unknown) => Promise.resolve({ data: { success: true, data } });

describe('isOwnStorage', () => {
  it('is true only for a bucket the customer brought', () => {
    expect(isOwnStorage({ ownership: 'customer', source: 'customer', driver: 's3' })).toBe(true);
  });

  it('is false for the platform storage and for a row wiring the managed bucket', () => {
    expect(isOwnStorage({ ownership: 'platform', source: 'platform', driver: 's3' })).toBe(false);
    expect(isOwnStorage({ ownership: 'platform', source: 'customer', driver: 's3' })).toBe(false);
  });

  it('is false when there is nothing, or no ownership to go by', () => {
    expect(isOwnStorage(null)).toBe(false);
    expect(isOwnStorage(undefined)).toBe(false);
    expect(isOwnStorage({ driver: 's3' })).toBe(false);
  });
});

describe('StorageStep pre-selection', () => {
  beforeEach(() => get.mockReset());
  afterEach(cleanup);

  it('leaves a new workspace (platform storage) unselected', async () => {
    get.mockReturnValue(answer({ source: 'platform', ownership: 'platform', driver: 's3' }));
    const onChoiceChange = vi.fn();
    render(<StorageStep onChoiceChange={onChoiceChange} />);

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/integrations/storage-config'));
    await Promise.resolve();
    expect(screen.queryByTestId('byo-form')).not.toBeInTheDocument();
    expect(onChoiceChange).not.toHaveBeenCalledWith('byo');
  });

  it('pre-selects BYO when the workspace has its own bucket', async () => {
    get.mockReturnValue(answer({ source: 'customer', ownership: 'customer', driver: 's3' }));
    const onChoiceChange = vi.fn();
    render(<StorageStep onChoiceChange={onChoiceChange} />);

    expect(await screen.findByTestId('byo-form')).toBeInTheDocument();
    expect(onChoiceChange).toHaveBeenCalledWith('byo');
  });
});

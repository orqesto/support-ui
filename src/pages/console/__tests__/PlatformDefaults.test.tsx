import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { PlatformSettings } from '@/services/platformSettings.service';

const SAMPLE: PlatformSettings = {
  ai: {
    defaultModel: { value: 'gpt-5-mini', source: 'default' },
    strongModel: { value: 'gpt-5-custom', source: 'db' },
    visionModel: { value: 'gpt-4o-mini', source: 'env' },
    defaultCostPer1k: { value: null, source: 'default' },
    strongCostPer1k: { value: 0.01, source: 'db' },
    visionCostPer1k: { value: null, source: 'default' },
    apiKey: { configured: false, source: 'none', last4: null },
  },
  storage: {
    driver: { value: 's3', source: 'db' },
    endpoint: { value: 'https://s3.example.com', source: 'db' },
    region: { value: 'eu-central-1', source: 'env' },
    bucket: { value: 'odly', source: 'db' },
    prefix: { value: null, source: 'env' },
    forcePathStyle: { value: false, source: 'env' },
    accessKeyId: { configured: true, source: 'env', last4: 'ABCD' },
    secretAccessKey: { configured: false, source: 'none', last4: null },
  },
};

const noopMutation = { mutate: vi.fn(), isPending: false };
vi.mock('@/hooks/usePlatformSettings', () => ({
  usePlatformSettings: () => ({ isLoading: false, isError: false, data: SAMPLE, refetch: vi.fn() }),
  useUpdatePlatformAi: () => noopMutation,
  useUpdatePlatformStorage: () => noopMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
  useTestPlatformStorage: () => noopMutation,
}));

const { PlatformDefaults } = await import('../PlatformDefaults');

afterEach(cleanup);
beforeEach(() => {
  noopMutation.mutate.mockClear();
});

describe('PlatformDefaults', () => {
  it('renders both cards with source badges and secret status', () => {
    render(<PlatformDefaults />);
    expect(screen.getByText('Managed AI Defaults')).toBeInTheDocument();
    expect(screen.getByText('Default Storage')).toBeInTheDocument();
    // Source badges reflect the resolved layer.
    expect(screen.getAllByText('Console').length).toBeGreaterThan(0); // db-sourced fields
    expect(screen.getAllByText('Environment').length).toBeGreaterThan(0); // env-sourced fields
    expect(screen.getAllByText('Default').length).toBeGreaterThan(0); // code-default fields
    // Unset secrets (AI key + S3 secret) show a "Not set" badge.
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(2);
    // An env-set access key shows its masked last4, never the value.
    expect(screen.getByText(/····ABCD/)).toBeInTheDocument();
  });

  it('gates S3 Save behind a successful connection test', () => {
    render(<PlatformDefaults />);
    expect(
      screen.getByText('Run a successful connection test before saving an S3 target.')
    ).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /save storage default/i });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(noopMutation.mutate).not.toHaveBeenCalled();
  });
});

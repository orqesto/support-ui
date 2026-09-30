import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import type { PlatformSettings, SecretStatus } from '@/services/platformSettings.service';

const noopMutation = { mutate: vi.fn(), isPending: false };
let finishProbe: (result: unknown) => void = () => {};
const testMutation = {
  mutate: vi.fn((_payload: unknown, opts?: { onSuccess?: (result: unknown) => void }) => {
    finishProbe = (result) => opts?.onSuccess?.(result);
  }),
  isPending: false,
};
const saveMutation = { mutate: vi.fn(), isPending: false };
vi.mock('@/hooks/usePlatformSettings', () => ({
  useUpdatePlatformStorage: () => saveMutation,
  useTestPlatformStorage: () => testMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
}));

const { DefaultStorageCard } = await import('../DefaultStorageCard');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };
const storage = {
  driver: { value: 's3', source: 'db' },
  effectiveDriver: 's3',
  envS3Configured: false,
  endpoint: { value: 'https://s3.example.com', source: 'db' },
  region: { value: 'eu-central-1', source: 'db' },
  bucket: { value: 'odly', source: 'db' },
  prefix: { value: null, source: 'default' },
  forcePathStyle: { value: false, source: 'default' },
  roleArn: { value: null, source: 'default' },
  externalId: { value: null, source: 'default' },
  accessKeyId: UNSET,
  secretAccessKey: UNSET,
} as PlatformSettings['storage'];

const saveButton = () => screen.getByRole('button', { name: /save storage default/i });
const bucketInput = () => screen.getByPlaceholderText('my-bucket');
const startProbe = () => {
  render(<DefaultStorageCard storage={storage} />);
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
  expect(saveButton()).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
};
const landProbe = async (result: unknown) => {
  await act(async () => {
    finishProbe(result);
    await Promise.resolve();
  });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Save storage default is locked until a test passes. The fields stay editable while the
 * probe runs, and its answer used to be taken as the answer for whatever the form held when
 * it LANDED — so a green for bucket "odly" unlocked Save for a bucket nobody tested.
 */
describe('Default storage — a test that lands after the form changed', () => {
  it('⛔ does not unlock Save for settings it never tested', async () => {
    startProbe();
    fireEvent.change(bucketInput(), { target: { value: 'never-tested' } });
    await landProbe({ ok: true, latencyMs: 5 });

    expect(testMutation.mutate.mock.calls[0][0]).toMatchObject({ bucket: 'odly' });
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText(/connection ok/i)).not.toBeInTheDocument();
  });

  it('⛔ nor prints its failure under the new settings', async () => {
    startProbe();
    fireEvent.change(bucketInput(), { target: { value: 'never-tested' } });
    await landProbe({ ok: false, latencyMs: 0, error: 'NoSuchBucket: odly' });
    expect(screen.queryByText(/NoSuchBucket/)).not.toBeInTheDocument();
  });

  it('⛔ a replaced stored S3 key re-locks Save — keys never travel in the tested payload', async () => {
    const { rerender } = render(<DefaultStorageCard storage={storage} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    await landProbe({ ok: true, latencyMs: 5 });
    expect(saveButton()).toBeEnabled();

    // The key's own Save button stored a new access key; the settings query refetched.
    rerender(
      <DefaultStorageCard
        storage={{ ...storage, accessKeyId: { configured: true, source: 'db', last4: 'NEW1' } }}
      />
    );
    expect(saveButton()).toBeDisabled();
  });

  it('CONTROL: a test nobody overtook unlocks Save', async () => {
    startProbe();
    await landProbe({ ok: true, latencyMs: 5 });
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText(/connection ok/i)).toBeInTheDocument();
  });
});

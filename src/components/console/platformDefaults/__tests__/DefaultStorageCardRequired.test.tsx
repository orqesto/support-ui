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
const saveMutation: { mutate: ReturnType<typeof vi.fn>; isPending: boolean; error: unknown; reset: () => void } = {
  mutate: vi.fn(),
  isPending: false,
  error: null,
  reset: vi.fn(),
};
vi.mock('@/hooks/usePlatformSettings', () => ({
  useUpdatePlatformStorage: () => saveMutation,
  useTestPlatformStorage: () => testMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
}));

const { DefaultStorageCard } = await import('../DefaultStorageCard');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };
const field = (value: string | null) =>
  ({ value, source: value === null ? 'default' : 'db' }) as const;
const storageWith = (over: Partial<Record<'endpoint' | 'region' | 'bucket', string | null>>, env = false) =>
  ({
    driver: { value: 's3', source: 'db' },
    effectiveDriver: 's3',
    envS3Configured: env,
    endpoint: field(over.endpoint === undefined ? 'https://s3.example.com' : over.endpoint),
    region: field(over.region === undefined ? 'eu-central-1' : over.region),
    bucket: field(over.bucket === undefined ? 'files' : over.bucket),
    prefix: field(null),
    forcePathStyle: { value: false, source: 'default' },
    roleArn: field(null),
    externalId: field(null),
    accessKeyId: UNSET,
    secretAccessKey: UNSET,
  }) as PlatformSettings['storage'];

const saveButton = () => screen.getByRole('button', { name: /save storage default/i });
const testButton = () => screen.getByRole('button', { name: /test connection/i });
const edit = (storage: PlatformSettings['storage']) => {
  render(<DefaultStorageCard storage={storage} />);
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
};
const passTest = async () => {
  fireEvent.click(testButton());
  await act(async () => {
    finishProbe({ ok: true, latencyMs: 5 });
    await Promise.resolve();
  });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  saveMutation.error = null;
});

/**
 * Production, 2026-11: the platform default storage was saved as S3 with no bucket, and every
 * attachment and KB upload through it failed for days. The bucket is the one S3 field nothing
 * can infer; the form must not let it go out empty.
 */
describe('Default storage — required S3 fields', () => {
  it('⛔ an empty bucket blocks Test and Save, and says why on the field', () => {
    edit(storageWith({}));
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: '  ' } });
    expect(testButton()).toBeInactive();
    expect(saveButton()).toBeInactive();
    expect(screen.getByText(/files cannot be stored without a bucket/i)).toBeInTheDocument();
  });

  it('⛔ a custom endpoint with no region blocks Test', () => {
    edit(storageWith({}));
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: '' } });
    expect(testButton()).toBeInactive();
    expect(screen.getByText(/required with a custom endpoint/i)).toBeInTheDocument();
  });

  it('CONTROL: AWS (no endpoint) may leave the region to the environment', async () => {
    edit(storageWith({ endpoint: null, region: null }));
    expect(testButton()).not.toBeInactive();
    await passTest();
    expect(saveButton()).not.toBeInactive();
  });

  it('⛔ "use the environment" with no bucket in the environment cannot be saved', () => {
    const storage = { ...storageWith({ endpoint: null, region: null, bucket: null }, true) };
    storage.driver = { value: 's3', source: 'db' };
    edit(storage);
    expect(testButton()).toBeInactive();
    expect(saveButton()).toBeInactive();
    expect(screen.getByText(/environment provides no S3 bucket/i)).toBeInTheDocument();
  });

  it('CONTROL: a complete target unlocks Save after a passing test', async () => {
    edit(storageWith({}));
    expect(testButton()).not.toBeInactive();
    await passTest();
    expect(saveButton()).not.toBeInactive();
  });
});

describe('Default storage — a refused save', () => {
  it('⛔ shows the server sentence on the form', () => {
    saveMutation.error = new Error('s3 storage requires a bucket');
    edit(storageWith({}));
    expect(screen.getByText(/Not saved: s3 storage requires a bucket/)).toBeInTheDocument();
  });

  it('CONTROL: no error, no sentence', () => {
    edit(storageWith({}));
    expect(screen.queryByText(/Not saved/)).not.toBeInTheDocument();
  });
});

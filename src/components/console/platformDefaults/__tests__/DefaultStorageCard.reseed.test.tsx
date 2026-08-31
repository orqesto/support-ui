import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { PlatformSettings, SecretStatus } from '@/services/platformSettings.service';

const noopMutation = { mutate: vi.fn(), isPending: false };
// Test/save mutations that actually invoke the caller's onSuccess, so the card's
// post-save transition is exercised rather than stubbed away.
const testMutation = {
  mutate: vi.fn((_payload: unknown, opts?: { onSuccess?: (result: unknown) => void }) =>
    opts?.onSuccess?.({ ok: true, latencyMs: 12 })
  ),
  isPending: false,
};
const saveMutation = {
  mutate: vi.fn((_payload: unknown, opts?: { onSuccess?: (result: unknown) => void }) =>
    opts?.onSuccess?.(undefined)
  ),
  isPending: false,
};
vi.mock('@/hooks/usePlatformSettings', () => ({
  useUpdatePlatformStorage: () => saveMutation,
  useTestPlatformStorage: () => testMutation,
  useSetPlatformSecret: () => noopMutation,
  useClearPlatformSecret: () => noopMutation,
}));

const { DefaultStorageCard } = await import('../DefaultStorageCard');

const UNSET: SecretStatus = { configured: false, source: 'none', last4: null };

type Storage = PlatformSettings['storage'];

/** A console-configured S3 target, so the card renders its editable S3 fields. */
const storageWithBucket = (bucket: string): Storage => ({
  driver: { value: 's3', source: 'db' },
  effectiveDriver: 's3',
  envS3Configured: false,
  endpoint: { value: 'https://s3.example.com', source: 'db' },
  region: { value: 'eu-central-1', source: 'db' },
  bucket: { value: bucket, source: 'db' },
  prefix: { value: null, source: 'default' },
  forcePathStyle: { value: false, source: 'default' },
  roleArn: { value: null, source: 'default' },
  externalId: { value: null, source: 'default' },
  accessKeyId: UNSET,
  secretAccessKey: UNSET,
});

const bucketInput = () => screen.getByPlaceholderText<HTMLInputElement>('my-bucket');
/** The card opens read-only; the form exists only in the editing state. */
const openEditor = () => fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

afterEach(cleanup);

/**
 * The card mirrors stored config in local state seeded by `useState` INITIALISERS,
 * which run only on mount. Saving invalidates the query, so the prop refetched and
 * the source badges updated — but the inputs kept whatever had been typed. A value
 * the server normalised, rejected, or never stored stayed on screen looking saved.
 *
 * These two tests pin both halves: the form must follow the STORED config, and it
 * must not treat an unchanged background refetch as a reason to discard an edit.
 */
describe('DefaultStorageCard re-seeds from stored config', () => {
  it('shows what the server stored, not what was typed, once the stored config changes', () => {
    const { rerender } = render(<DefaultStorageCard storage={storageWithBucket('odly')} />);
    openEditor();
    expect(bucketInput().value).toBe('odly');

    fireEvent.change(bucketInput(), { target: { value: 'typed-but-never-stored' } });
    expect(bucketInput().value).toBe('typed-but-never-stored');

    // The save round-trip: server stored something else, refetch delivers it.
    rerender(<DefaultStorageCard storage={storageWithBucket('what-the-server-stored')} />);

    expect(bucketInput().value).toBe('what-the-server-stored');
  });

  it('does not discard an in-progress edit on an unchanged background refetch', () => {
    const { rerender } = render(<DefaultStorageCard storage={storageWithBucket('odly')} />);
    openEditor();

    fireEvent.change(bucketInput(), { target: { value: 'still-editing' } });

    // React Query refetches on window focus: a NEW object, identical values.
    rerender(<DefaultStorageCard storage={storageWithBucket('odly')} />);

    expect(bucketInput().value).toBe('still-editing');
  });
});

/**
 * The probe result is the last thing on screen; Save is a separate control below it.
 * A tested-but-unsaved config must not present the same green as a stored one — and a
 * save returns the card to the read-only view, which is a stronger confirmation than a
 * badge because the values shown afterwards were re-read rather than typed.
 */
describe('DefaultStorageCard distinguishes tested from saved', () => {
  it('qualifies a passing probe while editing, and plainly when the config is stored', () => {
    render(<DefaultStorageCard storage={storageWithBucket('odly')} />);

    // Stored: the probe tested the live config, so the green needs no caveat.
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    expect(screen.getByText(/connection ok/i).textContent).not.toMatch(/not saved yet/i);

    openEditor();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));
    expect(screen.getByText(/not saved yet/i)).toBeTruthy();
  });

  it('returns to the read-only view on save — the mode change IS the confirmation', () => {
    render(<DefaultStorageCard storage={storageWithBucket('odly')} />);
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    fireEvent.click(screen.getByRole('button', { name: /save storage default/i }));

    // The form is gone and the summary is back, so what is on screen came from the server.
    expect(screen.queryByPlaceholderText('my-bucket')).toBeNull();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeTruthy();
  });

  it('discards the draft on cancel and shows the stored config again', () => {
    render(<DefaultStorageCard storage={storageWithBucket('odly')} />);
    openEditor();
    fireEvent.change(bucketInput(), { target: { value: 'abandoned-draft' } });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByPlaceholderText('my-bucket')).toBeNull();

    openEditor();
    expect(bucketInput().value).toBe('odly');
  });
});

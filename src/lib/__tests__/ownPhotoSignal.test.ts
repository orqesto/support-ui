/**
 * "My profile photo changed": the lists that show the person (tickets, threads, users) drop their
 * cached pages so the next view shows the new photo (review 8b, F5). A shared signal, so the
 * settings feature never imports those features.
 */
import { describe, expect, it, vi } from 'vitest';
import { onOwnPhotoChanged, ownPhotoChanged } from '@/lib/ownPhotoSignal';

describe('own photo signal', () => {
  it('calls every listener once per change, and not after it unsubscribes', () => {
    const listener = vi.fn();
    const stop = onOwnPhotoChanged(listener);
    ownPhotoChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    ownPhotoChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

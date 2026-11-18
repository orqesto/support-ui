/** A changed own photo drops the cached thread pages, so rows and cards show it (8b, F5). */
import { describe, expect, it, vi } from 'vitest';
import { ownPhotoChanged } from '@/lib/ownPhotoSignal';
import { useMessagesStore } from '../messagesStore';

describe('messagesStore on an own-photo change', () => {
  it('clears its cache', () => {
    const clearCache = vi.fn();
    useMessagesStore.setState({ clearCache });
    ownPhotoChanged();
    expect(clearCache).toHaveBeenCalledTimes(1);
  });
});

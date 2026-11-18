/** A changed own photo drops the cached thread pages, so rows and cards show it (8b, F5). */
import { describe, expect, it } from 'vitest';
import { ownPhotoChanged } from '@/lib/ownPhotoSignal';
import { useMessagesStore } from '../messagesStore';

describe('messagesStore on an own-photo change', () => {
  it('forgets its cached pages (the real store state)', () => {
    useMessagesStore.setState({ cache: { 'page-1': {} as never } });
    expect(Object.keys(useMessagesStore.getState().cache)).toHaveLength(1);
    ownPhotoChanged();
    expect(Object.keys(useMessagesStore.getState().cache)).toHaveLength(0);
  });
});

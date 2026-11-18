/** A changed own photo drops the cached ticket pages, so the rows show it (8b, F5). */
import { describe, expect, it } from 'vitest';
import { ownPhotoChanged } from '@/lib/ownPhotoSignal';
import { useTicketsStore } from '../ticketsStore';

describe('ticketsStore on an own-photo change', () => {
  it('forgets its cached pages', () => {
    useTicketsStore.setState({ cache: new Map([['page', {} as never]]) });
    ownPhotoChanged();
    expect(useTicketsStore.getState().cache.size).toBe(0);
  });
});

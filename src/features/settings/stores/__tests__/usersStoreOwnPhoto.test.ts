/** A changed own photo drops the cached users page, so Settings → Users shows it (8b, F5). */
import { describe, expect, it } from 'vitest';
import { ownPhotoChanged } from '@/lib/ownPhotoSignal';
import { useUsersStore } from '../usersStore';

describe('usersStore on an own-photo change', () => {
  it('forgets its cached page', () => {
    useUsersStore.setState({ lastFetch: Date.now() });
    ownPhotoChanged();
    expect(useUsersStore.getState().lastFetch).toBeNull();
  });
});

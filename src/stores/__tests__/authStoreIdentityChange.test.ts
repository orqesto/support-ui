/** Signing in as a DIFFERENT person clears the cached lists (they show the previous person's data). */
import { describe, expect, it, vi } from 'vitest';
import { onOwnPhotoChanged } from '@/lib/ownPhotoSignal';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

const user = (id: number) => ({ id, email: `u${id}@x.example`, firstName: 'U' }) as User;

describe('authStore.login and the cached lists', () => {
  it('a different person → caches cleared; the same person again → not', () => {
    useAuthStore.getState().login(null, user(1));
    const cleared = vi.fn();
    const stop = onOwnPhotoChanged(cleared);
    useAuthStore.getState().login(null, user(1));
    expect(cleared).not.toHaveBeenCalled();
    useAuthStore.getState().logout();
    useAuthStore.getState().login(null, user(2));
    expect(cleared).toHaveBeenCalledTimes(1);
    stop();
  });
});

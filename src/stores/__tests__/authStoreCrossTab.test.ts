/**
 * The store's wiring of the cross-tab watcher: another tab's different person reloads THIS tab;
 * the same person does not; the unsent editor text is still there for the reloaded page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readUnsentDraft, writeUnsentDraft } from '@/lib/unsentDrafts';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

const reload = vi.fn();
const original = window.location;

beforeEach(() => {
  reload.mockReset();
  Object.defineProperty(window, 'location', { value: { ...original, reload }, configurable: true });
  useAuthStore.getState().login(null, { id: 7, email: 'u7@x.example', firstName: 'U' } as User);
});
afterEach(() => Object.defineProperty(window, 'location', { value: original, configurable: true }));

const otherTabWrites = (id: number | null) =>
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'auth-storage',
      newValue: JSON.stringify({ state: { user: id === null ? null : { id } } }),
    })
  );

describe('authStore across tabs', () => {
  it('another tab signed in as someone else → this tab reloads; its unsent text survives', () => {
    writeUnsentDraft('draft:thread:1', { text: 'half-written reply' });
    otherTabWrites(9);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(readUnsentDraft<{ text: string }>('draft:thread:1')?.text).toBe('half-written reply');
  });

  it('another tab writes the same person (e.g. after its own reload) → no reload, no loop', () => {
    otherTabWrites(7);
    expect(reload).not.toHaveBeenCalled();
  });

  it('another tab signed out → this tab reloads', () => {
    otherTabWrites(null);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

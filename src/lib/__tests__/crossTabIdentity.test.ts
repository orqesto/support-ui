/**
 * Another tab signed out, or signed in as someone else: this tab must not go on showing (and acting
 * as) the old person. The saved login is shared by all tabs; nothing synced it (staging 2026-11-19:
 * a tab showed "Admin User" while its session was another user).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchCrossTabIdentity } from '@/lib/crossTabIdentity';

const saved = (id: number | null) =>
  JSON.stringify({ state: { user: id === null ? null : { id, email: `u${id}@x.example` } } });
const write = (key: string, value: string | null) =>
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));

let stop = () => undefined as void;
afterEach(() => stop());

describe('watchCrossTabIdentity', () => {
  const watch = (current: number | null) => {
    const onChange = vi.fn();
    stop = watchCrossTabIdentity(() => current, onChange);
    return onChange;
  };

  it('another tab signed in as a DIFFERENT person → reacts', () => {
    const onChange = watch(1);
    write('auth-storage', saved(2));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('another tab signed out → reacts', () => {
    const onChange = watch(1);
    write('auth-storage', null);
    write('auth-storage', saved(null));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('a write for the SAME person (e.g. a new photo) → nothing', () => {
    const onChange = watch(1);
    write('auth-storage', saved(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('control: another key, or this tab signed out and another tab too → nothing', () => {
    const onChange = watch(1);
    write('messages-filters', saved(2));
    stop();
    const signedOut = watch(null);
    write('auth-storage', saved(null));
    expect(onChange).not.toHaveBeenCalled();
    expect(signedOut).not.toHaveBeenCalled();
  });
});

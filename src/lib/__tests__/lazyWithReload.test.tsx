/**
 * A lazy chunk the last deploy removed: retried once, then ONE guarded reload for the new build —
 * never a blank app, never a reload loop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, Suspense, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import {
  CHUNK_RELOAD_GUARD_MS,
  CHUNK_RELOAD_KEY,
  installStaleChunkReload,
  lazyWithReload,
} from '../lazyWithReload';

const reload = vi.fn();
const realLocation = window.location;
beforeEach(() => {
  reload.mockReset();
  window.sessionStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, reload },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>boundary</p> : this.props.children;
  }
}
const Page = () => <p>loaded page</p>;
const mount = (factory: () => Promise<{ default: typeof Page }>) => {
  const Lazy = lazyWithReload(factory);
  render(
    <Boundary>
      <Suspense fallback={<p>loading</p>}>
        <Lazy />
      </Suspense>
    </Boundary>
  );
};
const stale = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

describe('lazyWithReload', () => {
  it('an import that fails once (a dropped connection) is retried and renders', async () => {
    const factory = vi.fn().mockImplementationOnce(stale).mockResolvedValue({ default: Page });
    mount(factory);
    expect(await screen.findByText('loaded page')).toBeTruthy();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('one that keeps failing reloads the page exactly once, and stays on the loading state', async () => {
    const factory = vi.fn(stale);
    mount(factory);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(factory).toHaveBeenCalledTimes(2);
    expect(screen.getByText('loading')).toBeTruthy();
    expect(Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY))).toBeGreaterThan(0);
  });

  it('the flag prevents a loop: failing again right after the reload shows the error, no reload', async () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mount(vi.fn(stale));
    expect(await screen.findByText('boundary')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it('CONTROL: a flag older than the guard window reloads again', async () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now() - CHUNK_RELOAD_GUARD_MS - 1));
    mount(vi.fn(stale));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('no storage (blocked): no guard, so no reload — the error shows', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mount(vi.fn(stale));
    expect(await screen.findByText('boundary')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("Vite's preload failure", () => {
  it('reloads once (and stops Vite throwing); a second one inside the window does not', () => {
    installStaleChunkReload();
    const first = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);
    const second = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(second);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });
});

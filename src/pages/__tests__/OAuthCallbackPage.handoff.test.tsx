import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OAuthCallbackPage } from '../OAuthCallbackPage';
import { listenForGmailOAuthCode } from '@/features/settings/shell';

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/oauth/gmail/callback?code=c9&state=s9']}>
      <OAuthCallbackPage />
    </MemoryRouter>
  );
// Channel messages are delivered by the event loop, not by timers: real turns, fake timers.
const deliver = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await act(() => new Promise<void>((resolve) => setImmediate(resolve)));
  }
};
const openerDescriptor = Object.getOwnPropertyDescriptor(window, 'opener');
const NOT_RECEIVED = /The app did not receive this authorization/;

describe('OAuthCallbackPage — the hand-off to the app window', () => {
  let stopApp: (() => void) | null = null;
  const appWindowListens = (state = 's9') => {
    const onCode = vi.fn();
    stopApp = listenForGmailOAuthCode(state, onCode);
    return onCode;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
  });
  afterEach(() => {
    stopApp?.();
    stopApp = null;
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (openerDescriptor) Object.defineProperty(window, 'opener', openerDescriptor);
    sessionStorage.clear();
  });

  it('no opener (Google severed it): the app window takes the code, acknowledges, the pop-up closes', async () => {
    const onCode = appWindowListens();
    mount();
    await deliver();
    expect(onCode).toHaveBeenCalledWith({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c9', state: 's9' });
    expect(screen.getByText(/Authorization successful/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('gmail_oauth_payload')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('no app window acknowledges (its tab reloaded): says so and stays open', async () => {
    mount();
    await deliver();
    expect(screen.queryByText(/Authorization successful/)).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByText(NOT_RECEIVED)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(window.close).not.toHaveBeenCalled();
  });

  it("another flow's listener does not acknowledge this code", async () => {
    const onCode = appWindowListens('other');
    mount();
    await deliver();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(onCode).not.toHaveBeenCalled();
    expect(screen.getByText(NOT_RECEIVED)).toBeInTheDocument();
  });

  it("a pop-up's inherited copy of a stale redirect config is not the redirect flow", async () => {
    sessionStorage.setItem(
      'gmail_oauth_pending_config',
      JSON.stringify({ config: {}, redirectUri: 'https://app.example/cb', state: 'old' })
    );
    const onCode = appWindowListens();
    mount();
    await deliver();
    expect(onCode).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('gmail_oauth_payload')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it('an opener that survived also gets the postMessage; the close still waits for the ack', async () => {
    const opener = { closed: false, postMessage: vi.fn() };
    Object.defineProperty(window, 'opener', { value: opener, configurable: true });
    appWindowListens();
    mount();
    expect(opener.postMessage).toHaveBeenCalledWith(
      { type: 'GMAIL_OAUTH_SUCCESS', code: 'c9', state: 's9' },
      window.location.origin
    );
    await deliver();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: the full-page redirect flow (its own state) keeps its own tab store', () => {
    sessionStorage.setItem(
      'gmail_oauth_pending_config',
      JSON.stringify({ config: {}, redirectUri: 'https://app.example/cb', state: 's9' })
    );
    mount();
    expect(JSON.parse(sessionStorage.getItem('gmail_oauth_payload') ?? 'null')).toEqual({
      code: 'c9',
      state: 's9',
    });
    expect(screen.getByText(/Returning to integrations/)).toBeInTheDocument();
  });
});

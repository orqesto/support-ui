import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OAuthCallbackPage } from '../OAuthCallbackPage';

// The app window, as the app bundle runs it (raw channel: the test needs no internal import).
const CHANNEL = 'gmail_oauth';
const listenForGmailOAuthCode = (
  expectedState: string,
  onCode: (message: { type: string; code: string; state: string }) => void
) => {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; code?: string; state?: string } | null;
    if (data?.type === 'GMAIL_OAUTH_SUCCESS' && data.state === expectedState && data.code) {
      channel.postMessage({ type: 'GMAIL_OAUTH_ACK', state: expectedState });
      onCode({ type: data.type, code: data.code, state: data.state });
    }
  };
  return () => channel.close();
};

const mount = (query = '?code=c9&state=s9') =>
  render(
    <MemoryRouter initialEntries={[`/oauth/gmail/callback${query}`]}>
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
    expect(screen.getByText(/handed to the app/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('gmail_oauth_payload')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('no app window acknowledges (its tab reloaded): says so and stays open', async () => {
    mount();
    await deliver();
    expect(screen.queryByText(/handed to the app/)).not.toBeInTheDocument();
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

  it('an opener that survived also gets the postMessage; the close still waits for the ack', async () => {
    const opener = { closed: false, postMessage: vi.fn() };
    Object.defineProperty(window, 'opener', { value: opener, configurable: true });
    appWindowListens();
    mount();
    await deliver();
    expect(opener.postMessage).toHaveBeenCalledWith(
      { type: 'GMAIL_OAUTH_SUCCESS', code: 'c9', state: 's9' },
      window.location.origin
    );
    await deliver();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a pending config here = the full-page redirect flow; it keeps its own tab store', () => {
    // Also a config stored by the bundle before this one: only the config's presence counts.
    sessionStorage.setItem(
      'gmail_oauth_pending_config',
      JSON.stringify({ config: {}, redirectUri: 'https://app.example/cb' })
    );
    const onCode = appWindowListens();
    mount();
    expect(JSON.parse(sessionStorage.getItem('gmail_oauth_payload') ?? 'null')).toEqual({
      code: 'c9',
      state: 's9',
    });
    expect(screen.getByText(/Returning to integrations/)).toBeInTheDocument();
    expect(onCode).not.toHaveBeenCalled();
  });

  it('an opener got the postMessage but no acknowledgement came (old bundle, or reloaded on Google): neutral, stays open', async () => {
    const opener = { closed: false, postMessage: vi.fn() };
    Object.defineProperty(window, 'opener', { value: opener, configurable: true });
    mount();
    await deliver();
    expect(opener.postMessage).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.queryByText(NOT_RECEIVED)).not.toBeInTheDocument();
    expect(screen.queryByText(/handed to the app|successful/)).not.toBeInTheDocument();
    expect(screen.getByText(/If Gmail does not show as connected there/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(window.close).not.toHaveBeenCalled();
  });

  it("Google's error is sent to the app window for this flow's state", async () => {
    const received: unknown[] = [];
    const app = new BroadcastChannel(CHANNEL);
    app.onmessage = (event: MessageEvent) => received.push(event.data);
    mount('?error=access_denied&state=s9');
    await deliver();
    app.close();
    expect(received).toEqual([{ type: 'GMAIL_OAUTH_ERROR', state: 's9', error: 'access_denied' }]);
    expect(screen.getByText(/Access was denied/)).toBeInTheDocument();
  });
});

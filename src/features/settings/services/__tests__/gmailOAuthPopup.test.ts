import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn<(url: string, body?: unknown) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (url: string, body?: unknown) => post(url, body),
    get: () =>
      Promise.resolve({ data: { success: true, data: { redirectUri: 'https://app.example/cb' } } }),
  },
}));

const { gmailOAuthService } = await import('@/features/settings/services/gmail-oauth.service');
const { announceGmailOAuthCode, announceGmailOAuthError } = await import(
  '@/features/settings/services/gmailOAuthHandoff'
);

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
const authUrls: string[] = [];
const callbacks = () =>
  post.mock.calls.filter(([url]) => url === '/api/oauth/gmail/callback').map(([, body]) => body);
const fromPopup = (code: string, state: string) =>
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'GMAIL_OAUTH_SUCCESS', code, state },
      origin: window.location.origin,
    })
  );

/**
 * The pop-up flow (connectWithPopup): the code arrives by postMessage (opener kept) or over the
 * BroadcastChannel (opener severed by Google). Every path takes only THIS flow's state, once.
 */
describe('Gmail OAuth pop-up flow', () => {
  let popup: {
    close: ReturnType<typeof vi.fn>;
    location: { href: string };
    sessionStorage: { removeItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
  };
  beforeEach(() => {
    post.mockReset();
    authUrls.length = 0;
    post.mockImplementation((url: string) => {
      if (url === '/api/oauth/gmail/authorize') {
        const authUrl = authUrls.shift() ?? 'https://accounts.example/auth?state=s1';
        return Promise.resolve({ data: { success: true, data: { authUrl } } });
      }
      return Promise.resolve({ data: { success: true, data: { id: 7, email: 'box@example.com' } } });
    });
    popup = {
      close: vi.fn(),
      location: { href: '' },
      sessionStorage: { removeItem: vi.fn(), setItem: vi.fn() },
    };
    vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);
  });
  afterEach(() => vi.restoreAllMocks());

  it('attaches the channel listener: a code announced there finishes the flow; then it stops', async () => {
    const flow = gmailOAuthService.connectWithPopup({});
    await flush();
    expect(popup.location.href).toBe('https://accounts.example/auth?state=s1');
    const onAck = vi.fn();
    const stopFirst = announceGmailOAuthCode('c1', 's1', onAck);
    await expect(flow).resolves.toMatchObject({ success: true });
    expect(callbacks()).toEqual([expect.objectContaining({ code: 'c1', state: 's1' })]);
    await flush();
    expect(onAck).toHaveBeenCalledTimes(1);
    // safeResolve closed the channel: a late announcement is neither taken nor acknowledged.
    const lateAck = vi.fn();
    const stopLate = announceGmailOAuthCode('c1', 's1', lateAck);
    await flush();
    expect(lateAck).not.toHaveBeenCalled();
    expect(callbacks()).toHaveLength(1);
    stopFirst?.();
    stopLate?.();
  });

  it("a double Reconnect: each flow takes only its own state's code", async () => {
    authUrls.push('https://accounts.example/auth?state=sA', 'https://accounts.example/auth?state=sB');
    const flowA = gmailOAuthService.connectWithPopup({});
    const flowB = gmailOAuthService.connectWithPopup({});
    await flush();
    fromPopup('cA', 'sA');
    await expect(flowA).resolves.toMatchObject({ success: true });
    expect(callbacks()).toEqual([expect.objectContaining({ code: 'cA', state: 'sA' })]);
    fromPopup('cB', 'sB');
    await expect(flowB).resolves.toMatchObject({ success: true });
    expect(callbacks()).toEqual([
      expect.objectContaining({ code: 'cA', state: 'sA' }),
      expect.objectContaining({ code: 'cB', state: 'sB' }),
    ]);
  });

  it('a second delivery of the same code (postMessage and channel) is sent once', async () => {
    const flow = gmailOAuthService.connectWithPopup({});
    await flush();
    fromPopup('c1', 's1');
    const stop = announceGmailOAuthCode('c1', 's1', () => undefined);
    await expect(flow).resolves.toMatchObject({ success: true });
    await flush();
    expect(callbacks()).toHaveLength(1);
    stop?.();
  });

  it.each([
    ['carries no state', 'https://accounts.example/auth?client_id=x'],
    ['does not parse', 'https://'],
  ])('an authorize URL that %s fails at once, visibly; no listener is left', async (_case, url) => {
    authUrls.push(url);
    const added = vi.spyOn(window, 'addEventListener');
    await expect(gmailOAuthService.connectWithPopup({})).resolves.toEqual({
      success: false,
      error: 'Invalid OAuth URL received from server',
    });
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(added.mock.calls.filter(([type]) => type === 'message')).toHaveLength(0);
  });

  it('each flow opens its own window: a second flow never takes over the first pop-up', async () => {
    authUrls.push(
      'https://accounts.example/auth?state=sA',
      'https://accounts.example/auth?state=sB'
    );
    const flowA = gmailOAuthService.connectWithPopup({});
    const flowB = gmailOAuthService.connectWithPopup({});
    const names = vi.mocked(window.open).mock.calls.map(([, name]) => name);
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
    await flush();
    fromPopup('cB', 'sB');
    await expect(flowB).resolves.toMatchObject({ success: true });
    // Flow A did not take B's code.
    expect(callbacks()).toEqual([expect.objectContaining({ code: 'cB', state: 'sB' })]);
    fromPopup('cA', 'sA');
    await expect(flowA).resolves.toMatchObject({ success: true });
    expect(callbacks()).toEqual([
      expect.objectContaining({ code: 'cB', state: 'sB' }),
      expect.objectContaining({ code: 'cA', state: 'sA' }),
    ]);
  });

  it("the redirect keys are cleared in the POP-UP's own copy before it navigates; this tab keeps its own", async () => {
    sessionStorage.setItem('gmail_oauth_pending_config', JSON.stringify({ config: {} }));
    const flow = gmailOAuthService.connectWithPopup({});
    // Marked as a pop-up and cleared at once, before the pop-up is sent to Google.
    expect(popup.sessionStorage.setItem).toHaveBeenCalledWith('gmail_oauth_popup', '1');
    expect(popup.sessionStorage.removeItem).toHaveBeenCalledWith('gmail_oauth_pending_config');
    expect(popup.sessionStorage.removeItem).toHaveBeenCalledWith('gmail_oauth_payload');
    expect(popup.location.href).toBe('');
    // A redirect this tab started stays live.
    expect(sessionStorage.getItem('gmail_oauth_pending_config')).toBe('{"config":{}}');
    await flush();
    fromPopup('c1', 's1');
    await flow;
    sessionStorage.clear();
  });

  it("Google's error fails the flow at once (channel and postMessage), not after the timeout", async () => {
    authUrls.push(
      'https://accounts.example/auth?state=sE',
      'https://accounts.example/auth?state=sP'
    );
    const viaChannel = gmailOAuthService.connectWithPopup({});
    await flush();
    announceGmailOAuthError('sE', 'access_denied');
    await expect(viaChannel).resolves.toMatchObject({
      success: false,
      error: 'Access was denied. Please try again.',
    });
    const viaOpener = gmailOAuthService.connectWithPopup({});
    await flush();
    // Another flow's error is not this one's.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'GMAIL_OAUTH_ERROR', state: 'sX', error: 'access_denied' },
        origin: window.location.origin,
      })
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'GMAIL_OAUTH_ERROR', state: 'sP', error: 'server_error' },
        origin: window.location.origin,
      })
    );
    // sX's access_denied was ignored: the flow failed on ITS OWN error (server_error).
    await expect(viaOpener).resolves.toMatchObject({
      success: false,
      error: 'The authorization server encountered an error.',
    });
    expect(callbacks()).toHaveLength(0);
  });

  it('a code delivered by postMessage is acknowledged too (whichever path came first)', async () => {
    const acks: unknown[] = [];
    const popupSide = new BroadcastChannel('gmail_oauth');
    popupSide.onmessage = (event: MessageEvent) => acks.push(event.data);
    const flow = gmailOAuthService.connectWithPopup({});
    await flush();
    fromPopup('c1', 's1');
    await expect(flow).resolves.toMatchObject({ success: true });
    await flush();
    popupSide.close();
    expect(acks).toEqual([{ type: 'GMAIL_OAUTH_ACK', state: 's1' }]);
  });

  it("another flow's code is neither taken nor acknowledged", async () => {
    const acks: unknown[] = [];
    const popupSide = new BroadcastChannel('gmail_oauth');
    popupSide.onmessage = (event: MessageEvent) => acks.push(event.data);
    const flow = gmailOAuthService.connectWithPopup({});
    await flush();
    fromPopup('cX', 'other');
    await flush();
    expect(acks).toEqual([]);
    expect(callbacks()).toHaveLength(0);
    fromPopup('c1', 's1');
    await flow;
    popupSide.close();
  });

  it("a code that arrives on both paths is acknowledged once, on the flow's channel", async () => {
    const acks: unknown[] = [];
    const popupSide = new BroadcastChannel('gmail_oauth');
    popupSide.onmessage = (event: MessageEvent) => {
      if ((event.data as { type?: string }).type === 'GMAIL_OAUTH_ACK') acks.push(event.data);
    };
    // The backend answers only after BOTH deliveries arrived (the flow is still open for both).
    let answer: (() => void) | undefined;
    post.mockImplementation((url: string) => {
      if (url === '/api/oauth/gmail/authorize') {
        return Promise.resolve({
          data: { success: true, data: { authUrl: 'https://accounts.example/auth?state=s1' } },
        });
      }
      return new Promise((resolve) => {
        answer = () =>
          resolve({ data: { success: true, data: { id: 7, email: 'box@example.com' } } });
      });
    });
    const flow = gmailOAuthService.connectWithPopup({});
    await flush();
    fromPopup('c1', 's1');
    popupSide.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c1', state: 's1' });
    await flush();
    expect(acks).toEqual([{ type: 'GMAIL_OAUTH_ACK', state: 's1' }]);
    answer?.();
    await expect(flow).resolves.toMatchObject({ success: true });
    popupSide.close();
    expect(callbacks()).toHaveLength(1);
  });

  it('an empty state= is no state: the flow fails at once', async () => {
    authUrls.push('https://accounts.example/auth?state=');
    await expect(gmailOAuthService.connectWithPopup({})).resolves.toMatchObject({
      success: false,
      error: 'Invalid OAuth URL received from server',
    });
  });

  it('pop-up names differ across page loads (an old pop-up left open is never reused)', async () => {
    const names: string[] = [];
    for (const loadedAt of [1_700_000_000_000, 1_700_000_500_000]) {
      vi.resetModules();
      vi.spyOn(Date, 'now').mockReturnValue(loadedAt);
      const fresh = await import('@/features/settings/services/gmail-oauth.service');
      vi.mocked(Date.now).mockRestore();
      // A blocked pop-up settles the flow at once (nothing left listening); the name was chosen.
      vi.mocked(window.open).mockReturnValueOnce(null);
      await fresh.gmailOAuthService.connectWithPopup({});
      names.push(String(vi.mocked(window.open).mock.calls.at(-1)?.[1]));
    }
    expect(names[0]).not.toBe(names[1]);
  });

  it("the pop-up's storage cannot be written: fail closed — closed and reported blocked (the redirect is offered)", async () => {
    popup.sessionStorage.setItem.mockImplementation(() => {
      throw new Error('storage denied');
    });
    await expect(gmailOAuthService.connectWithPopup({})).resolves.toMatchObject({
      success: false,
      error: 'POPUP_BLOCKED',
    });
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.location.href).toBe('');
    expect(post).not.toHaveBeenCalled();
  });
});

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
  let popup: { close: ReturnType<typeof vi.fn>; location: { href: string } };
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
    popup = { close: vi.fn(), location: { href: '' } };
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
    authUrls.push('https://accounts.example/auth?state=sA', 'https://accounts.example/auth?state=sB');
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

  it("a pop-up never inherits this tab's leftover redirect keys: they are cleared before it opens", async () => {
    sessionStorage.setItem('gmail_oauth_pending_config', JSON.stringify({ config: {} }));
    sessionStorage.setItem('gmail_oauth_payload', JSON.stringify({ code: 'old', state: 'old' }));
    let atOpen: (string | null)[] = [];
    vi.mocked(window.open).mockImplementation(() => {
      atOpen = [
        sessionStorage.getItem('gmail_oauth_pending_config'),
        sessionStorage.getItem('gmail_oauth_payload'),
      ];
      return popup as unknown as Window;
    });
    const flow = gmailOAuthService.connectWithPopup({});
    expect(atOpen).toEqual([null, null]);
    await flush();
    fromPopup('c1', 's1');
    await flow;
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
});

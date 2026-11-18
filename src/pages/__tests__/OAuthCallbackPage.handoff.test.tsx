import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OAuthCallbackPage } from '../OAuthCallbackPage';

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/oauth/gmail/callback?code=c9&state=s9']}>
      <OAuthCallbackPage />
    </MemoryRouter>
  );
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('OAuthCallbackPage — the hand-off to the app window', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
  });

  it('a pop-up with no opener (Google severed it) announces the code; it stores it nowhere', async () => {
    const heard: unknown[] = [];
    const channel = new BroadcastChannel('gmail_oauth');
    channel.onmessage = (event) => heard.push(event.data);
    mount();
    await flush();
    channel.close();
    expect(heard).toEqual([{ type: 'GMAIL_OAUTH_SUCCESS', code: 'c9', state: 's9' }]);
    expect(sessionStorage.getItem('gmail_oauth_payload')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('CONTROL: the full-page redirect flow keeps its own tab store', () => {
    sessionStorage.setItem('gmail_oauth_pending_config', JSON.stringify({ config: {} }));
    mount();
    expect(sessionStorage.getItem('gmail_oauth_payload')).not.toBeNull();
  });
});

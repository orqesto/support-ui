import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OAuthCallbackPage } from '../OAuthCallbackPage';
import { GMAIL_OAUTH_HANDOFF_KEY } from '@/features/settings/shell';

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/oauth/gmail/callback?code=c9&state=s9']}>
      <OAuthCallbackPage />
    </MemoryRouter>
  );

describe('OAuthCallbackPage — the hand-off to the app window', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    Object.defineProperty(window, 'opener', { value: null, configurable: true });
  });

  it('a pop-up with no opener (Google severed it) hands the code over through localStorage', () => {
    mount();
    expect(JSON.parse(localStorage.getItem(GMAIL_OAUTH_HANDOFF_KEY) ?? '{}')).toEqual({
      code: 'c9',
      state: 's9',
    });
    // Not the per-tab store the app window cannot read.
    expect(sessionStorage.getItem('gmail_oauth_payload')).toBeNull();
  });

  it('CONTROL: the full-page redirect flow keeps its own tab store', () => {
    sessionStorage.setItem('gmail_oauth_pending_config', JSON.stringify({ config: {} }));
    mount();
    expect(sessionStorage.getItem('gmail_oauth_payload')).not.toBeNull();
    expect(localStorage.getItem(GMAIL_OAUTH_HANDOFF_KEY)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from '../config';

/**
 * A self-hosted image must not carry the hosted API's address: with VITE_API_URL unset or empty the
 * app talks to its own origin (nginx.conf proxies /api and /socket.io there). The hosted builds set
 * VITE_API_URL and keep it.
 */
describe('the API origin', () => {
  const PAGE = 'https://support.customer.example';

  it('unset or empty in a build → the page origin (same-origin /api and socket)', () => {
    expect(resolveApiBaseUrl(undefined, false, PAGE)).toBe(PAGE);
    expect(resolveApiBaseUrl('', false, PAGE)).toBe(PAGE);
    expect(resolveApiBaseUrl('   ', false, PAGE)).toBe(PAGE);
  });

  it('control: a configured origin is used as given (the hosted builds)', () => {
    expect(resolveApiBaseUrl('https://api.example.com', false, PAGE)).toBe(
      'https://api.example.com'
    );
  });

  it('vite dev without one keeps the local backend', () => {
    expect(resolveApiBaseUrl(undefined, true, 'http://localhost:5173')).toBe(
      'http://localhost:3000'
    );
  });
});

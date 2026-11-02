import { afterEach, describe, expect, it } from 'vitest';
import {
  afterLoginPath,
  loginPathFor,
  rememberNextForSso,
  safeNextPath,
  takeSsoNextPath,
} from '../postLoginRedirect';

afterEach(() => sessionStorage.clear());

describe('postLoginRedirect', () => {
  it('a signed-out ticket link goes to /login carrying the whole address', () => {
    expect(loginPathFor({ pathname: '/tickets', search: '?id=101&needs=yes', hash: '' })).toBe(
      `/login?next=${encodeURIComponent('/tickets?id=101&needs=yes')}`
    );
    expect(loginPathFor({ pathname: '/tickets/101' })).toBe('/login?next=%2Ftickets%2F101');
  });

  it('the auth pages and the bare root carry nothing (no /login?next=/login loop)', () => {
    for (const pathname of ['/', '/login', '/signup', '/forgot-password', '/reset-password']) {
      expect(loginPathFor({ pathname, search: '?x=1' })).toBe('/login');
    }
  });

  it('after login: next wins, otherwise the dashboard', () => {
    expect(afterLoginPath('?next=%2Ftickets%2F101')).toBe('/tickets/101');
    expect(afterLoginPath('?next=%2Ftickets%3Fid%3D101%26sort%3DcreatedAt')).toBe(
      '/tickets?id=101&sort=createdAt'
    );
    expect(afterLoginPath('')).toBe('/dashboard');
  });

  it('never leaves the site: absolute, protocol-relative, backslash and script values are dropped', () => {
    for (const bad of [
      'https://evil.example/x',
      '//evil.example/x',
      '/\\evil.example',
      'javascript:alert(1)',
      'tickets/101',
      '',
    ]) {
      expect(safeNextPath(bad)).toBeNull();
      expect(afterLoginPath(`?next=${encodeURIComponent(bad)}`)).toBe('/dashboard');
    }
  });

  it('SSO: the address survives the identity-provider round trip, once', () => {
    rememberNextForSso('?next=%2Ftickets%2F101');
    expect(takeSsoNextPath()).toBe('/tickets/101');
    expect(takeSsoNextPath()).toBe('/dashboard');
  });

  it('SSO without next clears an older parked address', () => {
    rememberNextForSso('?next=%2Ftickets%2F101');
    rememberNextForSso('');
    expect(takeSsoNextPath()).toBe('/dashboard');
  });

  it('SSO: a planted unsafe value in storage is not followed', () => {
    sessionStorage.setItem('odly:post-login-next', '//evil.example');
    expect(takeSsoNextPath()).toBe('/dashboard');
  });
});

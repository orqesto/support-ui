import { describe, expect, it } from 'vitest';
import { showsWorkspaceBanner } from '../workspaceBannerRoutes';

describe('showsWorkspaceBanner', () => {
  it.each([
    '/',
    '/dashboard',
    '/messages',
    '/messages/42',
    '/tickets',
    '/tickets/edit/7',
    '/needs-routing',
    '/statistics',
    '/usage-stats',
  ])('hides it on the work surface %s', (path) => {
    expect(showsWorkspaceBanner(path)).toBe(false);
  });

  it.each(['/settings', '/users', '/knowledge-base', '/deleted-messages', '/messagesx', '/new'])(
    'keeps it on %s',
    (path) => {
      expect(showsWorkspaceBanner(path)).toBe(true);
    }
  );
});

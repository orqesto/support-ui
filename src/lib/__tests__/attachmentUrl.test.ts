import { describe, it, expect } from 'vitest';
import { attachmentDownloadUrl } from '../attachmentUrl';

const BASE = 'https://api.test';

describe('attachmentDownloadUrl', () => {
  it('puts the workspace in the PATH when one is selected', () => {
    // The whole point: a browser-loaded <img src> cannot send X-Organization-Context, so a
    // header-less global admin never binds the tenant scope and the row is looked for on the
    // shared database. The path is the only carrier a browser has.
    expect(attachmentDownloadUrl(16999, 21, BASE)).toBe(
      'https://api.test/api/organizations/21/attachments/16999/download'
    );
  });

  it('falls back to the legacy shape rather than emitting organizations/undefined', () => {
    // Exactly what `proxyRemoteImages` does. The backend still resolves this shape from the
    // header for anyone who can send one.
    for (const none of [undefined, null, 0, -1]) {
      expect(attachmentDownloadUrl(16999, none, BASE)).toBe(
        'https://api.test/api/attachments/16999/download'
      );
    }
  });

  it('never emits the string "undefined" or "null" in the path', () => {
    // The failure this guards is not a 404 — it is a url that LOOKS right in a screenshot.
    for (const none of [undefined, null]) {
      const url = attachmentDownloadUrl(1, none, BASE);
      expect(url).not.toContain('undefined');
      expect(url).not.toContain('null');
    }
  });

  it('matches the route the backend actually mounts', () => {
    /**
     * ⛔ Pinned as a literal on purpose. This url and the express route are written in two
     * repos, and nothing but this string connects them. In the email renderer the same kind of
     * pair drifted and would have removed every image from every email, silently — there the
     * fix was one shared builder, which is not available across a repo boundary. A literal that
     * has to be edited in both places is the next best thing.
     *
     * Backend: `app.use('/api/organizations/:organizationId/attachments', …)` in routes/index.ts
     *          + `router.get('/:attachmentId/download', …)` in orgScopedAttachmentRoutes.ts
     */
    const url = attachmentDownloadUrl(7, 3, BASE);
    expect(url).toBe('https://api.test/api/organizations/3/attachments/7/download');
    expect(url.startsWith(`${BASE}/api/organizations/`)).toBe(true);
    expect(url.endsWith('/download')).toBe(true);
  });
});

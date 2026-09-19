/**
 * The FILES-tab thumbnail: where its url points, and what it does when that url fails.
 *
 * `preloadedAttachments` is passed so the component never calls the service — this is about
 * the `<img>`, not the fetch.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { MessageAttachments } from '../MessageAttachments';
import { useAuthStore } from '@/stores/authStore';

afterEach(() => {
  cleanup();
  useAuthStore.setState({ selectedOrganizationId: null });
});

const message = { id: 1 } as never;
const attachments = [
  {
    id: 16999,
    originalFilename: 'roof.jpg',
    filename: 'stored.jpg',
    mimeType: 'image/jpeg',
    fileSize: 140_000,
  },
] as never;

describe('the FILES-tab thumbnail', () => {
  it('carries the workspace in the PATH when one is selected', () => {
    /**
     * ⛔ The browser loads this `<img src>` itself, so no axios interceptor runs and
     * `X-Organization-Context` never goes with it. For a global admin that header is the org
     * context's only carrier, and the backend binds the tenant scope only when the org
     * resolves non-null — so it queries the SHARED database and, under BYODB, does not find
     * the row.
     */
    useAuthStore.setState({ selectedOrganizationId: 21 });
    const { container } = render(
      <MessageAttachments message={message} preloadedAttachments={attachments} />
    );
    expect(container.querySelector('img')?.getAttribute('src')).toContain(
      '/api/organizations/21/attachments/16999/download'
    );
  });

  it('falls back to the legacy url with no workspace selected', () => {
    const { container } = render(
      <MessageAttachments message={message} preloadedAttachments={attachments} />
    );
    const src = container.querySelector('img')?.getAttribute('src') ?? '';
    expect(src).toContain('/api/attachments/16999/download');
    expect(src).not.toContain('undefined');
  });

  it('degrades to the file icon when the thumbnail fails, instead of a broken frame', () => {
    /**
     * This tab had NO error handler at all, so any 404 rendered a broken-image glyph — a file
     * missing from storage, or the FE reaching prod before the org-in-path route does, since
     * this repo deploys `main` on push while the backend ships on a tag. The thread chip has
     * always degraded; the FILES tab did not.
     */
    const { container } = render(
      <MessageAttachments message={message} preloadedAttachments={attachments} />
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as Element);
    expect(container.querySelector('img')).toBeNull();
    // The icon that replaces it is an svg in the same slot.
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

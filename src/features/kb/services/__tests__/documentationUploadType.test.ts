import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));

const { documentationService, withUploadType } = await import('../documentation.service');

/** The File the request carried in its `file` part. */
const sentFile = (): File => (post.mock.calls[0][1] as FormData).get('file') as File;

/**
 * The upload endpoint checks the part's Content-Type, and the browser takes it from the OS:
 * for a `.md` that is often '' (sent as application/octet-stream) or text/x-markdown. The
 * server's type filter refused those with a 500, so Markdown the picker offered never arrived.
 */
describe('KB upload — the type the server checks', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { id: 1 } });
  });

  it.each([
    ['', 'faq.md'],
    ['application/octet-stream', 'faq.md'],
    ['text/x-markdown', 'FAQ.MD'],
  ])('⛔ a Markdown file the browser typed %j is sent as text/markdown', async (type, name) => {
    const file = new File(['# Opening hours\n\nMon-Fri'], name, { type });
    await documentationService.uploadDocumentation(file, 'faq');
    expect(sentFile().type).toBe('text/markdown');
    expect(sentFile().name).toBe(name);
    expect(sentFile().size).toBe(file.size);
  });

  it('CONTROL: a type the server accepts is sent untouched', async () => {
    const file = new File(['%PDF'], 'guide.pdf', { type: 'application/pdf' });
    expect(withUploadType(file)).toBe(file);
    await documentationService.uploadDocumentation(file, 'guide');
    expect(sentFile()).toBe(file);
  });

  it('CONTROL: an extension with no mapping keeps the browser type', () => {
    const file = new File(['x'], 'notes.rtf', { type: '' });
    expect(withUploadType(file)).toBe(file);
  });
});

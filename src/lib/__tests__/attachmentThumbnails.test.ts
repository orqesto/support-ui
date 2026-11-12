import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn<(path: string) => Promise<{ data: Blob }>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (path: string) => get(path) } }));

const { heldThumbnails, loadThumbnails } = await import('../attachmentThumbnails');

const image = (id: number) => ({ id, mimeType: 'image/png', url: `/files/${id}.png` });
const pdf = { id: 9, mimeType: 'application/pdf', url: '/files/9.pdf' };

describe('attachment thumbnails', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation(() => Promise.resolve({ data: new Blob(['png']) }));
    URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}:${Math.random()}`);
    URL.revokeObjectURL = vi.fn();
  });

  it('fetches each image once — a refresh or a return to the ticket reuses it', async () => {
    const first = await loadThumbnails([image(1), image(2), pdf]);
    expect(Object.keys(first)).toEqual(['1', '2']);
    expect(get).toHaveBeenCalledTimes(2);
    const again = await loadThumbnails([image(1), image(2), pdf]);
    expect(again).toEqual(first);
    expect(get).toHaveBeenCalledTimes(2);
    expect(heldThumbnails([image(2)])).toEqual({ 2: first[2] });
  });

  it('a failed image is not held, and is asked for again next time', async () => {
    get.mockRejectedValueOnce(new Error('404'));
    expect(await loadThumbnails([image(3)])).toEqual({});
    expect(await loadThumbnails([image(3)])).toHaveProperty('3');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('two lists asking at once share one download', async () => {
    await Promise.all([loadThumbnails([image(4)]), loadThumbnails([image(4)])]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

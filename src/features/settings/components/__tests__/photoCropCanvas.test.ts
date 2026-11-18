/** The saved JPEG has no black corners: transparency is painted white before drawing. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropPhoto } from '../photoCrop';

afterEach(() => vi.restoreAllMocks());

describe('cropPhoto', () => {
  it('fills white, then draws the framed square, then exports JPEG', async () => {
    const calls: string[] = [];
    const context = {
      set fillStyle(value: string) {
        calls.push(`fillStyle=${value}`);
      },
      fillRect: () => calls.push('fillRect'),
      drawImage: () => calls.push('drawImage'),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (done: (blob: Blob) => void, type: string) => {
        calls.push(`toBlob:${type}`);
        done(new Blob(['x'], { type }));
      },
    };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? canvas : realCreate(tag)) as typeof document.createElement);
    class FakeImage {
      naturalWidth = 400;
      naturalHeight = 300;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);

    await cropPhoto('blob:x', { zoom: 1, offsetX: 0, offsetY: 0 });
    expect(calls).toEqual(['fillStyle=#ffffff', 'fillRect', 'drawImage', 'toBlob:image/jpeg']);
  });
});

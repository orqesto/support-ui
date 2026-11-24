import { describe, it, expect } from 'vitest';
import {
  attachmentItem,
  documentItem,
  itemFile,
  itemKind,
  itemName,
  safeBlobType,
  shownMimeType,
  viewerKindOf,
} from '../fileViewerModel';
import type { Attachment } from '@/types/ai';

describe('viewer model: documentation items and Markdown (1.1.330)', () => {
  const doc = (mimeType: string, name: string) =>
    documentItem({ id: 9, name, mimeType, size: 120 });

  it('a document item has its own key, name, kind and file', () => {
    const item = doc('application/pdf', 'leaflet.pdf');
    expect(item.key).toBe('doc:9');
    expect(itemName(item)).toBe('leaflet.pdf');
    expect(itemKind(item)).toBe('pdf');
    expect(itemFile(item)).toEqual({ mimeType: 'application/pdf', size: 120 });
  });

  it('Markdown is its own kind (by type, by name when generic, .md declared text/plain)', () => {
    expect(viewerKindOf('text/markdown', 'a.md')).toBe('markdown');
    expect(viewerKindOf('text/x-markdown', 'a')).toBe('markdown');
    expect(viewerKindOf('application/octet-stream', 'notes.markdown')).toBe('markdown');
    expect(viewerKindOf('text/plain', 'notes.md')).toBe('markdown');
    expect(viewerKindOf('text/plain', 'notes.txt')).toBe('text');
    expect(safeBlobType('text/markdown', 'markdown')).toBe('text/plain');
  });

  it('a document TIFF is SHOWN as WEBP (the backend converts it); an attachment TIFF is not', () => {
    expect(shownMimeType(doc('image/tiff', 'scan.tif'))).toBe('image/webp');
    expect(shownMimeType(doc('image/png', 'a.png'))).toBe('image/png');
    const tiff = attachmentItem({
      id: 1,
      mimeType: 'image/tiff',
      originalFilename: 'a.tif',
      size: 1,
    } as Attachment);
    expect(shownMimeType(tiff)).toBe('image/tiff');
  });

  it('old .doc / .xls documents have no viewer kind (they go to the text read from them)', () => {
    expect(itemKind(doc('application/msword', 'old.doc'))).toBe('other');
    expect(itemKind(doc('application/vnd.ms-excel', 'old.xls'))).toBe('other');
  });
});

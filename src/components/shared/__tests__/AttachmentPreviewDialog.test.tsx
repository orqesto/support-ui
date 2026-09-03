/**
 * In-app attachment preview — a PDF or photo opens in a dialog instead of forcing a
 * download. The bytes go through apiClient (auth + refresh live there), and the blob is
 * re-typed with the attachment's own mime type: the endpoint serves generic bytes, and a
 * blob URL without `application/pdf` makes the browser download instead of render.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { Attachment } from '@/types/ai';

const getBlob = vi.fn<(...args: unknown[]) => Promise<{ data: Blob }>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => getBlob(...args) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import {
  AttachmentPreviewDialog,
  isPreviewable,
} from '@/components/shared/AttachmentPreviewDialog';

const attachment = (over: Partial<Attachment>): Attachment =>
  ({
    id: 7,
    originalFilename: 'transaction-confirmation-report_es-es_84a939.pdf',
    mimeType: 'application/pdf',
    size: 28_570,
    ...over,
  }) as Attachment;

describe('isPreviewable', () => {
  it('covers what a browser can actually render, and nothing else', () => {
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('video/mp4')).toBe(true);
    expect(isPreviewable('audio/mpeg')).toBe(true);
    expect(isPreviewable('application/zip')).toBe(false);
    expect(isPreviewable('application/vnd.ms-excel')).toBe(false);
  });
});

describe('AttachmentPreviewDialog', () => {
  const createdTypes: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    createdTypes.length = 0;
    // jsdom has no object URLs; capture the blob type the component hands over.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        createdTypes.push(blob.type);
        return 'blob:preview-url';
      },
      revokeObjectURL: vi.fn(),
    });
    getBlob.mockResolvedValue({ data: new Blob(['%PDF-1.4']) });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders a PDF in an iframe, with the blob re-typed as application/pdf', async () => {
    const { baseElement } = render(
      <AttachmentPreviewDialog attachment={attachment({})} onClose={vi.fn()} />
    );
    await waitFor(() => expect(baseElement.querySelector('iframe')).not.toBeNull());
    const frame = baseElement.querySelector('iframe');
    expect(frame?.getAttribute('title')).toContain('transaction-confirmation');
    expect(frame?.getAttribute('src')).toBe('blob:preview-url');
    expect(createdTypes).toEqual(['application/pdf']);
    expect(getBlob).toHaveBeenCalledWith('/api/attachments/7/download', { responseType: 'blob' });
  });

  it('renders an image as an <img>, not an iframe', async () => {
    render(
      <AttachmentPreviewDialog
        attachment={attachment({ mimeType: 'image/jpeg', originalFilename: 'parcel.jpg' })}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByAltText('parcel.jpg')).toBeInTheDocument());
    expect(screen.getByAltText('parcel.jpg').tagName).toBe('IMG');
  });

  it('honors a downloadPath override (Jira-hosted attachments)', async () => {
    render(
      <AttachmentPreviewDialog
        attachment={attachment({ mimeType: 'image/png' })}
        onClose={vi.fn()}
        downloadPath="/api/attachments/jira/7/download"
      />
    );
    await waitFor(() => expect(getBlob).toHaveBeenCalled());
    expect(getBlob).toHaveBeenCalledWith('/api/attachments/jira/7/download', {
      responseType: 'blob',
    });
  });

  it('a failed fetch offers the download fallback instead of a blank dialog', async () => {
    getBlob.mockRejectedValue(new Error('403'));
    render(<AttachmentPreviewDialog attachment={attachment({})} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Could not load the preview/)).toBeInTheDocument()
    );
  });

  it('renders nothing when there is no attachment', () => {
    const { container } = render(<AttachmentPreviewDialog attachment={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

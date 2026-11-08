/**
 * The FILES tab keeps working, and its Preview opens the same file viewer as the thread —
 * now also for Word/Excel/text files, with next/previous through the tab's own list.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiClient: { get: apiGet } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { MessageAttachments } from '../MessageAttachments';

afterEach(() => {
  cleanup();
  apiGet.mockReset();
});

const message = { id: 1 } as never;
const files = [
  { id: 31, originalFilename: 'roof.jpg', mimeType: 'image/jpeg', size: 140_000 },
  {
    id: 32,
    originalFilename: 'quote.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 20_000,
  },
  { id: 33, originalFilename: 'archive.zip', mimeType: 'application/zip', size: 9_000 },
] as never;

describe('Files tab → file viewer', () => {
  it('Preview on a Word file opens the viewer with the backend preview, n of N over the tab', async () => {
    apiGet.mockResolvedValue({
      data: { success: true, data: { kind: 'html', html: '<p>Quote total</p>', truncated: false } },
    });
    render(<MessageAttachments message={message} preloadedAttachments={files} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview quote.docx' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('2 of 3')).toBeTruthy();
    expect((await within(dialog).findByTestId('document-preview')).textContent).toContain(
      'Quote total'
    );
    expect(apiGet).toHaveBeenCalledWith('/api/attachments/32/preview');
  });

  it('a file with no preview keeps only Download in its row', () => {
    render(<MessageAttachments message={message} preloadedAttachments={files} />);
    expect(screen.queryByRole('button', { name: 'Preview archive.zip' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download archive.zip' })).toBeTruthy();
  });

  it('closing the viewer leaves the list as it was', () => {
    render(<MessageAttachments message={message} preloadedAttachments={files} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview roof.jpg' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByTestId('file-row')).toHaveLength(3);
  });
});
